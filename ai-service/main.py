"""
main.py — FastAPI entry point for the VaultIQ AI detection microservice.

Endpoints
---------
GET  /health   — liveness probe; returns 200 with service status.
POST /detect   — accepts up to 5 multipart file uploads, extracts text,
                  preprocesses into chunks, and returns a JSON summary.

Run locally:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import os
import tempfile
import logging
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import detector
import extractor
import preprocessor

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

PORT: int = int(os.getenv("PORT", "8000"))
ALLOWED_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
]

MAX_FILES = 5
SUPPORTED_TYPES = {"pdf", "docx", "txt"}

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="VaultIQ AI Detection Service",
    description=(
        "Pipeline skeleton for AI-content detection. "
        "Accepts document uploads, extracts and preprocesses text, "
        "and returns chunk analysis ready for ML scoring."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    logger.info("Initiating model loading...")
    try:
        detector.load_models()
    except Exception as e:
        logger.error(f"Critical failure loading models: {e}")

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", summary="Health check")
async def health() -> JSONResponse:
    """Return service liveness status.

    Returns:
        200 JSON with ``status``, ``model_loaded``, and ``version`` fields.
    """
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "ok",
            "model_loaded": detector.is_model_loaded(),
            "version": app.version,
        },
    )


@app.post("/detect", summary="Detect AI-generated content in uploaded documents")
async def detect_files(
    files: list[UploadFile] = File(..., description="Up to 5 documents (pdf/docx/txt)"),
) -> JSONResponse:
    """Process up to 5 uploaded files through the extraction + preprocessing pipeline.

    For each file the service will:
      1. Save the upload to a temporary file.
      2. Extract plain text via :mod:`extractor`.
      3. Split into sentence chunks via :mod:`preprocessor`.
      4. Return a summary JSON object per file.

    Args:
        files: Multipart file uploads.

    Returns:
        200 JSON list, one entry per file::

            {
                "filename":         str,   // original filename
                "raw_text_preview": str,   // first 300 chars of extracted text
                "chunks_count":     int,   // number of preprocessed chunks
                "status":           str    // "ok" | "error"
                "error":            str    // only present when status == "error"
            }

    Raises:
        422: If no files are provided or more than 5 files are submitted.
        503: If models are not loaded.
    """
    if not detector.is_model_loaded():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI models are not loaded yet or failed to load. Please try again later."
        )

    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one file must be provided.",
        )
    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"A maximum of {MAX_FILES} files can be processed per request.",
        )

    results: list[dict[str, Any]] = []

    for upload in files:
        filename = upload.filename or "unnamed"
        file_ext = Path(filename).suffix.lstrip(".").lower()

        if file_ext not in SUPPORTED_TYPES:
            results.append(
                {
                    "filename": filename,
                    "raw_text_preview": "",
                    "chunks_count": 0,
                    "status": "error",
                    "error": (
                        f"Unsupported file type '.{file_ext}'. "
                        f"Accepted: {', '.join(sorted(SUPPORTED_TYPES))}."
                    ),
                }
            )
            continue

        # Write the upload to a temp file so extractor can read it
        try:
            suffix = f".{file_ext}"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp_path = tmp.name
                content = await upload.read()
                tmp.write(content)
        except Exception as exc:
            results.append(
                {
                    "filename": filename,
                    "raw_text_preview": "",
                    "chunks_count": 0,
                    "status": "error",
                    "error": f"Failed to save upload: {exc}",
                }
            )
            continue

        try:
            raw_text = extractor.extract_text(tmp_path, file_ext)
            chunks = preprocessor.preprocess(raw_text)

            detection_result = detector.detect(chunks)

            merged_result = {
                "filename": filename,
                "raw_text_preview": raw_text[:300],
                "chunks_count": len(chunks),
                "status": "ok",
                **detection_result
            }
            results.append(merged_result)
        except (ValueError, FileNotFoundError, ImportError, OSError) as exc:
            results.append(
                {
                    "filename": filename,
                    "raw_text_preview": "",
                    "chunks_count": 0,
                    "status": "error",
                    "error": str(exc),
                }
            )
        finally:
            # Always clean up the temp file
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except Exception:
                pass

    return JSONResponse(status_code=status.HTTP_200_OK, content=results)


# ---------------------------------------------------------------------------
# Dev entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
