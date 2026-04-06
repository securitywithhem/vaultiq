import os
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from extractor import extract_text
from trainer import train_model, REPORT_PATH
from detector import detect, model_trained
from similarity import compare, determine_verdict
from corpus import corpus_store

app = FastAPI(title="VaultIQ AI Content Detection Service")

class TextRequest(BaseModel):
    text: str

class CorpusRequest(BaseModel):
    doc_id: str
    text: str

@app.get("/health")
async def health_check():
    """
    Returns the system health, model training status, and corpus size.
    """
    trained = model_trained()
    report = None
    if trained and os.path.exists(REPORT_PATH):
        try:
            with open(REPORT_PATH, 'r') as f:
                report = json.load(f)
        except Exception:
            pass
            
    return {
        "status": "ok",
        "model_trained": trained,
        "corpus_size": corpus_store.size(),
        "training_report": {
            "accuracy": report.get('accuracy') if report else None,
            "total_samples": report.get('total_samples') if report else None
        } if report else None
    }

@app.post("/train")
async def train():
    """
    Triggers the model training process on the local dataset.
    """
    try:
        results = train_model()
        return results
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

@app.post("/detect")
async def detect_file(file: UploadFile = File(...)):
    """
    Extracts text from an uploaded file and detects AI content.
    """
    if not model_trained():
        raise HTTPException(status_code=400, detail="Model not trained. POST to /train first.")
    
    file_bytes = await file.read()
    text = extract_text(file_bytes, file.filename)
    
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract text from the file.")
    
    word_count = len(text.split())
    if word_count < 100:
        raise HTTPException(status_code=422, detail=f"Document too short ({word_count} words). Minimum 100 words required for reliable analysis.")

    try:
        result = detect(text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

@app.post("/detect-text")
async def detect_raw_text(request: TextRequest):
    """
    Detects AI content from raw text input.
    """
    if not model_trained():
        raise HTTPException(status_code=400, detail="Model not trained. POST to /train first.")
    
    text = request.text
    word_count = len(text.split())
    if word_count < 10: # Lower limit for direct text testing
        raise HTTPException(status_code=422, detail=f"Text too short ({word_count} words).")

    try:
        result = detect(text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

@app.post("/plagiarism/add")
async def add_to_corpus(request: CorpusRequest):
    """
    Adds a document to the in-memory corpus for plagiarism checking.
    """
    corpus_store.add(request.doc_id, request.text)
    return {"status": "success", "message": f"Document {request.doc_id} added to corpus", "corpus_size": corpus_store.size()}

@app.post("/plagiarism/check")
async def check_plagiarism(request: TextRequest):
    """
    Compares text against the entire corpus.
    """
    if corpus_store.size() == 0:
        return {
            "status": "success",
            "message": "Corpus is empty",
            "cosine_score": 0.0,
            "jaccard_score": 0.0,
            "verdict": "ORIGINAL",
            "matches": []
        }

    all_texts = corpus_store.get_all()
    cosine, jaccard, matches = compare(request.text, all_texts)
    verdict = determine_verdict(cosine, jaccard)

    return {
        "status": "success",
        "cosine_score": cosine,
        "jaccard_score": jaccard,
        "verdict": verdict,
        "matches": matches[:10] # Return top 10 matches
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
