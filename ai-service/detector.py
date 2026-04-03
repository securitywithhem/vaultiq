import os
import pickle
import functools
import numpy as np
from typing import Dict, Any
from feature_extractor import extract_features, features_to_array

MODEL_PATH = 'models/ai_detector.pkl'

@functools.lru_cache(maxsize=1)
def load_model():
    """
    Loads the trained model into memory and caches it for performance.
    """
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model file not found at {MODEL_PATH}. Run trainer first.")
    
    with open(MODEL_PATH, 'rb') as f:
        return pickle.load(f)

def model_trained() -> bool:
    """
    Checks if the model has been trained and saved.
    """
    return os.path.exists(MODEL_PATH)

def detect(text: str) -> Dict[str, Any]:
    """
    Loads the model and predicts if the text is AI-generated or human-written.
    Returns probability, classification, and feature-level insights.
    """
    model = load_model()
    
    # Extract features
    features = extract_features(text)
    X = features_to_array(features)
    
    # Predict probabilities (label 1 is AI)
    ai_probability = float(model.predict_proba(X)[0][1])
    
    # Classification logic based on probability
    if ai_probability > 0.75:
        classification = "Likely AI-generated"
        confidence = "High"
    elif ai_probability > 0.55:
        classification = "Possibly AI-generated"
        confidence = "Medium"
    elif ai_probability > 0.35:
        classification = "Mixed / Uncertain"
        confidence = "Low"
    else:
        classification = "Likely Human-written"
        confidence = "High"
    
    # Human-readable feature analysis (Insight extraction)
    # These thresholds are based on general stylometric research
    feature_analysis = {
        'sentence_uniformity': 'High (AI-like)' if features['sentence_length_std'] < 5 
                               else 'Normal (human-like)',
        'vocabulary_richness': 'Low (AI-like)' if features['type_token_ratio'] < 0.45 
                               else 'Normal (human-like)',
        'contraction_usage': 'Absent (AI-like)' if features['contraction_rate'] < 0.005 
                             else 'Present (human-like)',
        'phrase_repetition': 'High (AI-like)' if features['bigram_repetition_rate'] > 0.3 
                             else 'Normal (human-like)'
    }
    
    return {
        'ai_probability': round(ai_probability, 4),
        'ai_percentage': round(ai_probability * 100, 1),
        'classification': classification,
        'confidence': confidence,
        'features': features,
        'feature_analysis': feature_analysis
    }
