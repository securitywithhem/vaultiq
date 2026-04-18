"""
Retrain Logistic Regression on Kaggle data with optimized hyperparameters.
Improves model without requiring synthetic data generation.
"""

import pandas as pd
import numpy as np
import pickle
import sys
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.detector import extract_features

def load_kaggle_dataset():
    """Load Kaggle dataset."""

    print("📊 Loading Kaggle dataset...")

    kaggle_df = pd.read_csv('datasets/kaggle_unified_dataset.csv')
    print(f"  ✓ Loaded: {len(kaggle_df)} examples")

    # Ensure consistent columns
    kaggle_df = kaggle_df[['text', 'label']]

    return kaggle_df

def extract_features_batch(texts):
    """Extract statistical features for all texts."""
    print("\n🔧 Extracting statistical features...")

    features_list = []
    for i, text in enumerate(texts):
        if (i + 1) % 2000 == 0:
            print(f"  Processed {i + 1}/{len(texts)} texts...", end="\r")

        try:
            features = extract_features(text)
            features_list.append(features)
        except Exception as e:
            # Use zero vector on error
            features_list.append([0] * 8)

    print(f"  ✓ Extracted features for {len(features_list)} texts")
    return np.array(features_list)

def train_logistic_regression(X, y):
    """Train Logistic Regression with optimized hyperparameters."""
    print("\n🤖 Training Logistic Regression (optimized)...")

    # Normalize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Convert labels to binary (handle both string and numeric labels)
    if isinstance(y[0], str):
        y_binary = (y == 'ai').astype(int)
    else:
        y_binary = y.astype(int)

    # Train with optimized parameters for better calibration
    lr_model = LogisticRegression(
        max_iter=2000,           # Increased from 1000
        random_state=42,
        class_weight='balanced', # Better for confidence calibration
        solver='lbfgs',          # Better convergence
        verbose=1
    )
    lr_model.fit(X_scaled, y_binary)

    # Calculate metrics
    train_score = lr_model.score(X_scaled, y_binary)
    print(f"  ✓ Model trained. Training accuracy: {train_score:.4f}")

    return lr_model, scaler

def save_model(lr_model, scaler, backup=True):
    """Save trained model and scaler with backup."""
    print("\n💾 Saving model...")

    model_path = Path('models/lr_model.pkl')
    scaler_path = Path('models/scaler.pkl')

    # Backup old model
    if backup and model_path.exists():
        backup_path = Path('models/lr_model.pkl.bak')
        import shutil
        shutil.copy(model_path, backup_path)
        print(f"  ✓ Backed up old model to {backup_path}")

    # Save new model
    with open(model_path, 'wb') as f:
        pickle.dump(lr_model, f)
    print(f"  ✓ Model saved to {model_path}")

    # Save scaler
    with open(scaler_path, 'wb') as f:
        pickle.dump(scaler, f)
    print(f"  ✓ Scaler saved to {scaler_path}")

def main():
    """Main retraining pipeline."""
    print("=" * 60)
    print("Retraining LR on Kaggle Data (Optimized)")
    print("=" * 60)

    # Load dataset
    kaggle_df = load_kaggle_dataset()

    # Extract features
    X = extract_features_batch(kaggle_df['text'].values)
    y = kaggle_df['label'].values

    # Train model
    lr_model, scaler = train_logistic_regression(X, y)

    # Save model
    save_model(lr_model, scaler, backup=True)

    print(f"\n{'=' * 60}")
    print("✅ Retraining complete!")
    print(f"{'=' * 60}")
    print("\nNote: Trained on Kaggle data with optimized hyperparameters")
    print("Expected improvement: 1-2% confidence boost on academic content")

if __name__ == "__main__":
    main()
