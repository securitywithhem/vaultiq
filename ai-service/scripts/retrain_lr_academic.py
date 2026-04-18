"""
Retrain Logistic Regression model on combined Kaggle + synthetic academic data.
Creates hybrid dataset: 75% Kaggle (general) + 25% academic (domain-specific)
"""

import pandas as pd
import numpy as np
import pickle
import sys
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

# Add core module to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.detector import extract_features

def load_and_combine_datasets():
    """Load Kaggle + synthetic academic data and combine with 75/25 ratio."""

    print("📊 Loading datasets...")

    # Load Kaggle dataset
    kaggle_df = pd.read_csv('datasets/kaggle_unified_dataset.csv')
    print(f"  ✓ Kaggle dataset: {len(kaggle_df)} rows")

    # Load synthetic academic dataset
    academic_df = pd.read_csv('datasets/academic_synthetic.csv')
    print(f"  ✓ Academic dataset: {len(academic_df)} rows")

    # Ensure consistent column names
    kaggle_df = kaggle_df.rename(columns={'text': 'text', 'label': 'label'})
    academic_df = academic_df.rename(columns={'text': 'text', 'label': 'label'})

    # Keep only text and label columns
    kaggle_df = kaggle_df[['text', 'label']]
    academic_df = academic_df[['text', 'label']]

    # Combine datasets: 75% Kaggle + 25% Academic
    combined_df = pd.concat([
        kaggle_df.sample(n=int(len(kaggle_df) * 0.75), random_state=42),
        academic_df.sample(n=int(len(academic_df) * 0.25), random_state=42)
    ]).reset_index(drop=True)

    print(f"\n🔀 Combined dataset:")
    print(f"  Total samples: {len(combined_df)}")
    print(f"  Human: {(combined_df['label'] == 'human').sum()}")
    print(f"  AI: {(combined_df['label'] == 'ai').sum()}")
    print(f"  Ratio: {(combined_df['label'] == 'human').sum() / len(combined_df) * 100:.1f}% human")

    return combined_df

def extract_features_batch(texts):
    """Extract statistical features for all texts."""
    print("\n🔧 Extracting statistical features...")

    features_list = []
    for i, text in enumerate(texts):
        if (i + 1) % 1000 == 0:
            print(f"  Processed {i + 1}/{len(texts)} texts...", end="\r")

        try:
            features = extract_features(text)
            features_list.append(features)
        except Exception as e:
            print(f"\n  ⚠️  Error extracting features from text {i}: {e}")
            # Use zero vector on error
            features_list.append([0] * 8)

    print(f"  ✓ Extracted features for {len(features_list)} texts")
    return np.array(features_list)

def train_logistic_regression(X, y):
    """Train Logistic Regression model."""
    print("\n🤖 Training Logistic Regression model...")

    # Normalize features to [0, 1]
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Convert labels to binary (0 = human, 1 = ai)
    y_binary = (y == 'ai').astype(int)

    # Train LR
    lr_model = LogisticRegression(max_iter=1000, random_state=42, verbose=1)
    lr_model.fit(X_scaled, y_binary)

    # Calculate training accuracy
    train_score = lr_model.score(X_scaled, y_binary)
    print(f"  ✓ Model trained. Training accuracy: {train_score:.4f}")

    return lr_model, scaler

def save_model(lr_model, scaler, backup=True):
    """Save trained model and scaler to pickle files."""
    print("\n💾 Saving model...")

    model_path = Path('models/lr_model.pkl')
    scaler_path = Path('models/scaler.pkl')

    # Backup old model if exists
    if backup and model_path.exists():
        backup_path = Path('models/lr_model.pkl.bak')
        import shutil
        shutil.copy(model_path, backup_path)
        print(f"  ✓ Backed up old model to {backup_path}")

    # Save new model
    with open(model_path, 'wb') as f:
        pickle.dump(lr_model, f)
    print(f"  ✓ Model saved to {model_path}")

    # Save scaler for inference
    with open(scaler_path, 'wb') as f:
        pickle.dump(scaler, f)
    print(f"  ✓ Scaler saved to {scaler_path}")

def main():
    """Main retraining pipeline."""
    print("=" * 60)
    print("Retraining Logistic Regression on Academic Data")
    print("=" * 60)

    # Load and combine datasets
    combined_df = load_and_combine_datasets()

    # Extract features
    X = extract_features_batch(combined_df['text'].values)
    y = combined_df['label'].values

    # Train model
    lr_model, scaler = train_logistic_regression(X, y)

    # Save model
    save_model(lr_model, scaler, backup=True)

    print(f"\n{'=' * 60}")
    print("✅ Retraining complete!")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
