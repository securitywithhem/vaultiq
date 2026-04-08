"""
main.py — FastAPI application entry point for the AI Detection Microservice.

Startup sequence (lifespan):
  1. Download required NLTK data
  2. Load GPT-2 (feature extractor)
  3. Load SBERT + FAISS index (PlagiarismModel)
  4. Load RF + DistilBERT (AIDetectorModel)

All model objects are stored on app.state and reused across requests.
CPU-bound inference is offloaded to a ThreadPoolExecutor to avoid
blocking the event loop.
"""

from __future__ import annotations

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import nltk
import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import CORS_ORIGINS
from models.ai_detector_model import AIDetectorModel
from models.plagiarism_model import PlagiarismModel
from schemas.request_response import (
    AddCorpusRequest,
    AddCorpusResponse,
    DetectTextRequest,
    DetectionResponse,
    ErrorResponse,
    HealthResponse,
    OverallResult,
)
from services.ai_detection_service import run_ai_detection
from services.plagiarism_service import run_plagiarism_detection
from services.preprocessor import preprocess
from services.text_extractor import extract_text
from utils.helpers import clamp, current_time_ms, overall_verdict

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
log = logging.getLogger(__name__)

# Thread pool for CPU-bound inference
_executor = ThreadPoolExecutor(max_workers=4)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Download NLTK data and load all ML models at startup."""
    log.info("=== AI Detection Microservice — startup ===")

    # 1. NLTK resources
    log.info("Downloading NLTK resources …")
    for resource in ("punkt", "punkt_tab", "stopwords", "averaged_perceptron_tagger"):
        nltk.download(resource, quiet=True)

    # 2. GPT-2 (used by feature extractor for perplexity)
    log.info("Loading GPT-2 …")
    from services.feature_extractor import load_gpt2
    await asyncio.get_event_loop().run_in_executor(_executor, load_gpt2)
    log.info("GPT-2 loaded.")

    # 3. Plagiarism model (SBERT + FAISS)
    log.info("Loading PlagiarismModel …")
    plagiarism_model = PlagiarismModel()
    await asyncio.get_event_loop().run_in_executor(_executor, plagiarism_model.load)
    app.state.plagiarism_model = plagiarism_model
    log.info("PlagiarismModel loaded. Corpus size: %d vectors",
             plagiarism_model._index.ntotal if plagiarism_model._index else 0)

    # 4. AI detector model (Random Forest only)
    log.info("Loading AIDetectorModel (Random Forest only)…")
    ai_model = AIDetectorModel()
    await asyncio.get_event_loop().run_in_executor(_executor, ai_model.load)
    app.state.ai_model = ai_model
    log.info("AIDetectorModel loaded. Using Random Forest inference.")

    app.state.models_loaded = True
    log.info("=== All models ready. API is live. ===")

    yield   # Application runs here

    log.info("=== Shutting down ===")
    _executor.shutdown(wait=False)


# ─── App Instantiation ────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Detection Microservice",
    description=(
        "Dual plagiarism + AI-generated text detection service "
        "for Secure Distributed Cloud Storage System."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Error Handler ────────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "code": "INTERNAL_ERROR"},
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _compute_overall(plag_score: float, ai_prob: float) -> tuple[float, str]:
    """Combine plagiarism score and AI probability into a single risk score."""
    risk = clamp(0.5 * plag_score + 0.5 * ai_prob)
    return risk, overall_verdict(risk)


async def _run_detection(
    request: Request,
    text: str,
    document_id: str,
) -> DetectionResponse:
    """
    Core detection pipeline — called by both /detect and /detect/file.

    Runs preprocessing, plagiarism detection, and AI detection.
    CPU-bound work is dispatched to the thread pool.
    """
    start_ms = current_time_ms()

    plagiarism_model: PlagiarismModel = request.app.state.plagiarism_model
    ai_model: AIDetectorModel = request.app.state.ai_model

    loop = asyncio.get_event_loop()

    # Preprocessing (relatively fast, but keeps pattern consistent)
    processed = await loop.run_in_executor(
        _executor, lambda: preprocess(text)
    )

    # Plagiarism detection
    plag_result = await loop.run_in_executor(
        _executor,
        lambda: run_plagiarism_detection(plagiarism_model, processed.raw_text),
    )

    # AI detection
    ai_result = await loop.run_in_executor(
        _executor,
        lambda: run_ai_detection(
            ai_model,
            processed.raw_text,
            processed.sentences,
            processed.clean_tokens,
        ),
    )

    elapsed_ms = current_time_ms() - start_ms
    risk_score, verdict = _compute_overall(plag_result.score, ai_result.probability)

    return DetectionResponse(
        document_id=document_id,
        plagiarism=plag_result,
        ai_detection=ai_result,
        overall=OverallResult(
            risk_score=round(risk_score, 4),
            verdict=verdict,
            processing_time_ms=elapsed_ms,
        ),
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health(request: Request) -> HealthResponse:
    """Liveness / readiness probe."""
    return HealthResponse(
        status="ok",
        models_loaded=getattr(request.app.state, "models_loaded", False),
    )


@app.post(
    "/detect",
    response_model=DetectionResponse,
    responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    tags=["Detection"],
)
async def detect_text(body: DetectTextRequest, request: Request) -> DetectionResponse:
    """
    Detect plagiarism and AI-generated content in a JSON text payload.

    Accepts: { "text": "...", "document_id": "..." }
    """
    try:
        return await _run_detection(request, body.text, body.document_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc), "code": "INVALID_INPUT"})
    except Exception as exc:
        log.exception("Detection error for document_id=%s", body.document_id)
        raise HTTPException(status_code=500, detail={"error": str(exc), "code": "DETECTION_ERROR"})


@app.post(
    "/detect/file",
    response_model=DetectionResponse,
    responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    tags=["Detection"],
)
async def detect_file(
    request: Request,
    file: UploadFile = File(...),
) -> DetectionResponse:
    """
    Detect plagiarism and AI-generated content in an uploaded PDF or DOCX.

    Accepts: multipart/form-data with a 'file' field.
    """
    try:
        data = await file.read()
        filename = file.filename or "upload"

        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(
            _executor, lambda: extract_text(filename, data)
        )

        # Use filename (without extension) as document_id
        doc_id = filename.rsplit(".", 1)[0] if "." in filename else filename
        return await _run_detection(request, text, doc_id)

    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc), "code": "INVALID_FILE"})
    except Exception as exc:
        log.exception("File detection error: %s", file.filename)
        raise HTTPException(status_code=500, detail={"error": str(exc), "code": "DETECTION_ERROR"})


@app.post(
    "/corpus/add",
    response_model=AddCorpusResponse,
    responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    tags=["Corpus"],
)
async def add_to_corpus(body: AddCorpusRequest, request: Request) -> AddCorpusResponse:
    """
    Add a document to the FAISS plagiarism corpus.

    Accepts: { "text": "...", "doc_id": "...", "title": "..." }
    """
    try:
        plagiarism_model: PlagiarismModel = request.app.state.plagiarism_model
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            _executor,
            lambda: plagiarism_model.add_document(body.text, body.doc_id, body.title),
        )
        return AddCorpusResponse(status="added", doc_id=body.doc_id)

    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc), "code": "INVALID_INPUT"})
    except Exception as exc:
        log.exception("Corpus add error for doc_id=%s", body.doc_id)
        raise HTTPException(status_code=500, detail={"error": str(exc), "code": "CORPUS_ERROR"})


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        workers=1,   # single worker to share model state
    )
