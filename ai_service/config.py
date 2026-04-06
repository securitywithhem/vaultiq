"""
config.py — Centralized configuration for the AI Detection Microservice.
All thresholds, model paths, and constants are defined here.
"""

from pathlib import Path

# ─── Base Paths ───────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
PROCESSED_DIR = DATA_DIR / "processed"

# ─── FAISS / Corpus Paths ─────────────────────────────────────────────────────
FAISS_INDEX_PATH: str = str(DATA_DIR / "faiss_index.bin")
CORPUS_METADATA_PATH: str = str(DATA_DIR / "corpus_metadata.json")

# ─── Saved Model Paths ────────────────────────────────────────────────────────
RF_MODEL_PATH: str = str(MODELS_DIR / "rf_classifier.joblib")
DISTILBERT_MODEL_DIR: str = str(MODELS_DIR / "distilbert_ai_detector")

# ─── Pre-trained HuggingFace Model IDs ───────────────────────────────────────
SBERT_MODEL_ID: str = "all-MiniLM-L6-v2"
DISTILBERT_BASE_MODEL_ID: str = "distilbert-base-uncased"
GPT2_MODEL_ID: str = "gpt2"

# ─── Embedding Dimensions ─────────────────────────────────────────────────────
SBERT_EMBEDDING_DIM: int = 384

# ─── Plagiarism Detection Thresholds ─────────────────────────────────────────
PLAGIARISM_SBERT_THRESHOLD: float = 0.85       # SBERT cosine similarity cutoff
PLAGIARISM_TFIDF_THRESHOLD: float = 0.70       # TF-IDF pre-filter cutoff
PLAGIARISM_WINDOW_SIZE: int = 5                # Sentence window size
PLAGIARISM_STRIDE: int = 2                     # Sentence window stride

# Plagiarism score → verdict mapping
PLAGIARISM_CLEAN_MAX: float = 0.10
PLAGIARISM_LOW_RISK_MAX: float = 0.30
PLAGIARISM_MEDIUM_MAX: float = 0.60
# above 0.60 → HIGH_RISK

PLAGIARISM_VERDICTS = {
    "CLEAN": (0.00, PLAGIARISM_CLEAN_MAX),
    "LOW_RISK": (PLAGIARISM_CLEAN_MAX, PLAGIARISM_LOW_RISK_MAX),
    "MEDIUM": (PLAGIARISM_LOW_RISK_MAX, PLAGIARISM_MEDIUM_MAX),
    "HIGH_RISK": (PLAGIARISM_MEDIUM_MAX, 1.01),
}

# ─── AI Detection Thresholds ──────────────────────────────────────────────────
AI_PERPLEXITY_SUSPICIOUS: float = 50.0        # Below this → suspicious (AI-like)
AI_BURSTINESS_THRESHOLD: float = 0.5          # Below this → AI-like uniformity

# Ensemble weights
AI_RF_WEIGHT: float = 0.40
AI_DISTILBERT_WEIGHT: float = 0.60

# AI probability → verdict mapping boundaries
AI_HUMAN_MAX: float = 0.20
AI_LIKELY_HUMAN_MAX: float = 0.40
AI_UNCERTAIN_MAX: float = 0.60
AI_LIKELY_AI_MAX: float = 0.80
# above 0.80 → AI

# ─── DistilBERT Inference Config ──────────────────────────────────────────────
DISTILBERT_MAX_LENGTH: int = 512
DISTILBERT_NUM_LABELS: int = 2

# ─── Overall Risk Score Verdicts ─────────────────────────────────────────────
OVERALL_CLEAN_MAX: float = 0.30
OVERALL_SUSPICIOUS_MAX: float = 0.65
# above 0.65 → HIGH_RISK

# ─── File Upload Limits ───────────────────────────────────────────────────────
MAX_FILE_SIZE_BYTES: int = 10 * 1024 * 1024   # 10 MB

# ─── CORS Origins ─────────────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = [
    "http://localhost:5000",
    "http://localhost:3000",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:3000",
]

# ─── Training Hyperparameters ────────────────────────────────────────────────
TRAIN_SPLIT: float = 0.70
VAL_SPLIT: float = 0.15
TEST_SPLIT: float = 0.15
RANDOM_SEED: int = 42

DISTILBERT_LEARNING_RATE: float = 2e-5
DISTILBERT_WEIGHT_DECAY: float = 0.01
DISTILBERT_BATCH_SIZE: int = 16
DISTILBERT_MAX_EPOCHS: int = 3
DISTILBERT_EVAL_STEPS: int = 500
DISTILBERT_PATIENCE: int = 2

RF_PARAM_GRID: dict = {
    "n_estimators": [100, 200],
    "max_depth": [10, 20, None],
}
RF_CV_FOLDS: int = 5
