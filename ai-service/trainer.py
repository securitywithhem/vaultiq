import os
import json
import pickle
import numpy as np
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from feature_extractor import extract_features, FEATURE_ORDER

HUMAN_DIR = 'data/human'
AI_DIR = 'data/ai'
MODEL_PATH = 'models/ai_detector.pkl'
REPORT_PATH = 'models/training_report.json'

def load_training_data() -> tuple[list, list]:
    """
    Reads all .txt files from HUMAN_DIR (label=0) and AI_DIR (label=1).
    Extracts text from each file and returns them as lists.
    """
    texts = []
    labels = []
    
    # Load Human samples (label 0)
    human_files = [f for f in os.listdir(HUMAN_DIR) if f.endswith('.txt')]
    for filename in human_files:
        with open(os.path.join(HUMAN_DIR, filename), 'r', encoding='utf-8') as f:
            texts.append(f.read())
            labels.append(0)
            
    # Load AI samples (label 1)
    ai_files = [f for f in os.listdir(AI_DIR) if f.endswith('.txt')]
    for filename in ai_files:
        with open(os.path.join(AI_DIR, filename), 'r', encoding='utf-8') as f:
            texts.append(f.read())
            labels.append(1)
            
    if len(texts) < 10:
        raise ValueError(f"Insufficient training data. Found {len(texts)} samples, min 10 required.")
    
    if labels.count(0) < 5 or labels.count(1) < 5:
        raise ValueError(f"Imbalanced classes. Found {labels.count(0)} human and {labels.count(1)} AI samples.")
        
    return texts, labels

def train_model() -> dict:
    """
    Orchestrates the training process for the AI detector.
    - Preprocesses text into features
    - Splits data for evaluation
    - Trains a RandomForestClassifier
    - Saves the model and a performance report
    """
    texts, labels = load_training_data()
    
    # Extract features for every document
    features_list = [extract_features(t) for t in texts]
    X = np.array([[f[k] for k in FEATURE_ORDER] for f in features_list])
    y = np.array(labels)
    
    # Split 80/20 train/test
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Train RandomForest
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        random_state=42,
        class_weight='balanced'
    )
    model.fit(X_train, y_train)
    
    # Evaluate model
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(
        y_test, y_pred, 
        target_names=['Human', 'AI'], 
        output_dict=True
    )
    
    # Extract feature importance
    importance = dict(zip(FEATURE_ORDER, model.feature_importances_.tolist()))
    
    # Ensure models directory exists
    os.makedirs('models', exist_ok=True)
    
    # Save model binary
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(model, f)
        
    # Build and save report
    training_report = {
        'accuracy': round(float(accuracy), 4),
        'total_samples': len(texts),
        'human_samples': labels.count(0),
        'ai_samples': labels.count(1),
        'classification_report': report,
        'feature_importance': {k: round(v, 4) for k, v in importance.items()},
        'trained_at': datetime.now().isoformat()
    }
    
    with open(REPORT_PATH, 'w') as f:
        json.dump(training_report, f, indent=2)
        
    return training_report

if __name__ == "__main__":
    try:
        results = train_model()
        print(f"Training successful! Accuracy: {results['accuracy']}")
    except Exception as e:
        print(f"Training failed: {str(e)}")
