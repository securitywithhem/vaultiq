"""
schemas/request_response.py — Pydantic v2 request and response models.
"""

from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


# ─── Request Models ───────────────────────────────────────────────────────────

class DetectTextRequest(BaseModel):
    text: str = Field(..., min_length=10, description="Text to analyze (min 10 chars)")
    document_id: str = Field(..., min_length=1, description="Caller-supplied document ID")

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank or whitespace only")
        return v


class AddCorpusRequest(BaseModel):
    text: str = Field(..., min_length=10, description="Document text to add to corpus")
    doc_id: str = Field(..., min_length=1, description="Unique document identifier")
    title: str = Field(default="", description="Optional document title")

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank or whitespace only")
        return v


# ─── Sub-response Models ──────────────────────────────────────────────────────

class MatchedSegment(BaseModel):
    text: str
    similarity: float = Field(..., ge=0.0, le=1.0)
    matched_doc_id: str
    start_char: int = Field(..., ge=0)
    end_char: int = Field(..., ge=0)


class PlagiarismResult(BaseModel):
    score: float = Field(..., ge=0.0, le=1.0)
    percentage: float = Field(..., ge=0.0, le=100.0)
    verdict: Literal["CLEAN", "LOW_RISK", "MEDIUM", "HIGH_RISK"]
    matched_segments: List[MatchedSegment] = Field(default_factory=list)


class AIFeatures(BaseModel):
    perplexity: float
    burstiness: float
    entropy: float
    repetition_rate: float


class AIDetectionResult(BaseModel):
    probability: float = Field(..., ge=0.0, le=1.0)
    percentage: float = Field(..., ge=0.0, le=100.0)
    verdict: Literal["HUMAN", "LIKELY_HUMAN", "UNCERTAIN", "LIKELY_AI", "AI"]
    features: AIFeatures
    distilbert_confidence: float = Field(..., ge=0.0, le=1.0)
    rf_confidence: float = Field(..., ge=0.0, le=1.0)


class OverallResult(BaseModel):
    risk_score: float = Field(..., ge=0.0, le=1.0)
    verdict: Literal["CLEAN", "SUSPICIOUS", "HIGH_RISK"]
    processing_time_ms: int = Field(..., ge=0)


# ─── Top-level Response Models ────────────────────────────────────────────────

class DetectionResponse(BaseModel):
    document_id: str
    plagiarism: PlagiarismResult
    ai_detection: AIDetectionResult
    overall: OverallResult


class AddCorpusResponse(BaseModel):
    status: Literal["added"]
    doc_id: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    models_loaded: bool


class ErrorResponse(BaseModel):
    error: str
    code: str
