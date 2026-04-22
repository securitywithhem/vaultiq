"""
Train on ALL available datasets (CSV + JSON combined)
Automatically detects and loads all files in datasets/ folder
"""

import json
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
import sys
import pickle
import os

sys.path.insert(0, str(Path(__file__).parent.parent))
from core.detector import extract_features

class MultiDatasetTrainer:
    """Train on multiple datasets - CSV + JSON"""

    def __init__(self):
        self.combined_data = []
        self.datasets_loaded = {}

    def load_csv(self, csv_file):
        """Load CSV file - auto-detect columns."""
        print(f"📂 Loading CSV: {Path(csv_file).name}")

        try:
            df = pd.read_csv(csv_file)

            # Auto-detect text and label columns
            text_col = None
            label_col = None

            # Look for common text column names
            for col in df.columns:
                if any(x in col.lower() for x in ['text', 'content', 'essay', 'abstract', 'submission', 'answer', 'response']):
                    text_col = col
                    break

            # Look for common label column names
            for col in df.columns:
                if any(x in col.lower() for x in ['label', 'class', 'source', 'is_ai', 'classification', 'verdict']):
                    label_col = col
                    break

            if not text_col or not label_col:
                print(f"  ⚠️  Couldn't auto-detect columns. Skipping.")
                print(f"     Columns found: {list(df.columns)}")
                return 0

            print(f"  Auto-detected: text='{text_col}', label='{label_col}'")

            # Load data
            count = 0
            for _, row in df.iterrows():
                text = str(row[text_col]).strip()
                label = str(row[label_col]).strip().lower()

                if text and len(text) > 50:  # Minimum length
                    # Normalize labels
                    if label in ['human', 'human-written', 'human_written', '0', 'no', 'false']:
                        label = 'human'
                    elif label in ['ai', 'ai-generated', 'ai_generated', 'chatgpt', 'gpt', '1', 'yes', 'true']:
                        label = 'ai'
                    else:
                        label = 'human'  # Default to human

                    self.combined_data.append({
                        'text': text,
                        'label': label,
                        'source': Path(csv_file).stem
                    })
                    count += 1

            self.datasets_loaded[Path(csv_file).name] = count
            print(f"  ✓ Loaded {count} rows")
            return count

        except Exception as e:
            print(f"  ❌ Error: {e}")
            return 0

    def load_json(self, json_file, limit=None):
        """Load JSON file - ArXiv or similar format."""
        print(f"📂 Loading JSON: {Path(json_file).name}")

        try:
            count = 0
            with open(json_file, 'r', encoding='utf-8') as f:
                for i, line in enumerate(f):
                    if limit and count >= limit:
                        break

                    try:
                        item = json.loads(line)

                        # Try to find text in common field names
                        text = None
                        for field in ['abstract', 'text', 'content', 'body', 'essay', 'answer']:
                            if field in item and item[field]:
                                text = str(item[field]).strip()
                                break

                        if text and len(text) > 50:
                            self.combined_data.append({
                                'text': text,
                                'label': 'human',  # Assume JSON papers are human-written
                                'source': Path(json_file).stem
                            })
                            count += 1

                            if count % 10000 == 0:
                                print(f"  Processing: {count}...", end="\r")

                    except json.JSONDecodeError:
                        continue

            self.datasets_loaded[Path(json_file).name] = count
            print(f"  ✓ Loaded {count} items")
            return count

        except Exception as e:
            print(f"  ❌ Error: {e}")
            return 0

    def load_all_from_folder(self, folder_path, csv_limit=None, json_limit=None):
        """Auto-load all CSV and JSON files from folder."""

        print("\n" + "=" * 60)
        print("AUTO-LOADING ALL DATASETS FROM FOLDER")
        print("=" * 60 + "\n")

        folder = Path(folder_path)

        # Load all CSV files
        csv_files = list(folder.glob('*.csv'))
        print(f"Found {len(csv_files)} CSV files\n")
        for csv_file in csv_files:
            self.load_csv(str(csv_file))

        # Load all JSON files
        json_files = list(folder.glob('*.json'))
        json_files += list(folder.glob('*.jsonl'))
        print(f"\nFound {len(json_files)} JSON files\n")
        for json_file in json_files:
            self.load_json(str(json_file), limit=json_limit)

        print("\n" + "=" * 60)

    def get_summary(self):
        """Show dataset summary."""
        df = pd.DataFrame(self.combined_data)

        print("\n" + "=" * 60)
        print("📊 COMBINED DATASET SUMMARY")
        print("=" * 60)
        print(f"\nTotal examples: {len(df):,}")
        print(f"Human texts: {(df['label'] == 'human').sum():,}")
        print(f"AI texts: {(df['label'] == 'ai').sum():,}")

        print(f"\n📁 Datasets loaded:")
        for name, count in sorted(self.datasets_loaded.items(), key=lambda x: x[1], reverse=True):
            print(f"   {name:40s}: {count:,} examples")

        print(f"\n📈 Label distribution:")
        labels = df['label'].value_counts()
        for label, count in labels.items():
            pct = (count / len(df) * 100)
            print(f"   {label:10s}: {count:,} ({pct:.1f}%)")

        print("=" * 60 + "\n")
        return df

    def extract_features_batch(self, texts):
        """Extract features for all texts."""
        print("🔧 Extracting features from all texts...")

        features_list = []
        errors = 0

        for i, text in enumerate(texts):
            if (i + 1) % 5000 == 0:
                print(f"  Processed {i + 1:,}/{len(texts):,}...", end="\r")

            try:
                features = extract_features(text)
                features_list.append(features)
            except Exception as e:
                features_list.append(np.zeros(8))
                errors += 1

        print(f"  ✓ Extracted {len(features_list):,} feature vectors ({errors} errors)\n")
        return np.array(features_list)

    def train(self):
        """Train LR model on combined data."""
        print("🤖 Training Logistic Regression model...")

        # Convert to DataFrame
        df = pd.DataFrame(self.combined_data)

        print(f"   Dataset size: {len(df):,} examples")

        # Extract features
        X = self.extract_features_batch(df['text'].values)
        y = (df['label'] == 'ai').astype(int)

        # Normalize
        print("📏 Normalizing features...")
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        print("   ✓ Scaled to standard normal distribution\n")

        # Train
        print("⚙️  Training model...")
        lr_model = LogisticRegression(
            max_iter=2000,
            random_state=42,
            class_weight='balanced',
            solver='lbfgs',
            verbose=0
        )
        lr_model.fit(X_scaled, y)

        # Evaluate
        accuracy = lr_model.score(X_scaled, y)
        print(f"   ✓ Training accuracy: {accuracy:.4f}\n")

        # Save
        self._save_models(lr_model, scaler)

        return lr_model, scaler, accuracy

    def _save_models(self, model, scaler):
        """Save trained models with backup."""
        print("💾 Saving models...")

        models_dir = Path('models')
        models_dir.mkdir(parents=True, exist_ok=True)

        model_path = models_dir / 'lr_model.pkl'
        scaler_path = models_dir / 'scaler.pkl'

        # Backup old models
        if model_path.exists():
            backup_model = models_dir / 'lr_model.pkl.bak'
            import shutil
            shutil.copy(model_path, backup_model)
            print(f"   ✓ Backed up old model")

        # Save new models
        with open(model_path, 'wb') as f:
            pickle.dump(model, f)

        with open(scaler_path, 'wb') as f:
            pickle.dump(scaler, f)

        print(f"   ✓ Saved to models/lr_model.pkl")
        print(f"   ✓ Saved to models/scaler.pkl\n")

def main():
    """Main training pipeline."""
    print("\n" + "=" * 60)
    print("MULTI-DATASET MODEL TRAINING")
    print("=" * 60 + "\n")

    trainer = MultiDatasetTrainer()

    # Auto-load all datasets from datasets folder
    trainer.load_all_from_folder(
        'datasets/',
        csv_limit=None,      # No limit
        json_limit=100000    # Limit JSON to 100k items (optional)
    )

    # Show summary
    df = trainer.get_summary()

    # Train
    model, scaler, accuracy = trainer.train()

    print("=" * 60)
    print("✅ TRAINING COMPLETE!")
    print("=" * 60)
    print(f"\nFinal accuracy: {accuracy:.4f}")
    print(f"Model saved: models/lr_model.pkl")
    print(f"Scaler saved: models/scaler.pkl")
    print("\n" + "=" * 60 + "\n")

if __name__ == "__main__":
    main()
