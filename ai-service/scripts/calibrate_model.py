"""
Calibrate the trained LR model using Platt scaling.
Improves confidence score accuracy on validation data.
"""

import json
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import joblib
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from core.detector import extract_features

class ModelCalibrator:
    """Calibrate LR model using Platt scaling."""

    def __init__(self):
        self.calibration_data = []
        self.scaler = None
        self.base_model = None
        self.calibrated_model = None

    def load_test_data(self, json_file):
        """Load test data from ai_detections.json for calibration."""
        print(f"📂 Loading calibration data from: {Path(json_file).name}")

        try:
            with open(json_file, 'r') as f:
                data = json.load(f)

            detections = data.get('detections', [])
            print(f"   Found {len(detections)} detection records")

            for detection in detections:
                # Extract verdict as label (for calibration purposes)
                verdict = detection.get('verdict', 'mixed')
                # Map verdict to binary label (ai_generated=1, others=0)
                label = 1 if verdict == 'ai_generated' else 0

                self.calibration_data.append({
                    'score': detection.get('score', 0.5),
                    'label': label,
                    'verdict': verdict,
                    'filename': detection.get('filename', ''),
                })

            print(f"   ✓ Loaded {len(self.calibration_data)} calibration samples\n")
            return len(self.calibration_data)

        except Exception as e:
            print(f"   ❌ Error: {e}\n")
            return 0

    def load_models(self, model_path='models/lr_model.pkl', scaler_path='models/scaler.pkl'):
        """Load trained model and scaler."""
        print("📦 Loading trained model and scaler...")

        try:
            self.base_model = joblib.load(model_path)
            self.scaler = joblib.load(scaler_path)
            print(f"   ✓ Loaded model from {model_path}")
            print(f"   ✓ Loaded scaler from {scaler_path}\n")
            return True
        except FileNotFoundError as e:
            print(f"   ❌ Error: {e}\n")
            return False

    def load_training_data(self, folder_path='datasets/'):
        """Load training data for calibration split."""
        print(f"📂 Loading training data from: {folder_path}")

        training_data = []
        folder = Path(folder_path)

        # Load CSV files
        csv_files = list(folder.glob('*.csv'))
        for csv_file in csv_files:
            try:
                df = pd.read_csv(csv_file)

                # Auto-detect columns
                text_col = None
                label_col = None

                for col in df.columns:
                    if any(x in col.lower() for x in ['text', 'content', 'essay', 'abstract']):
                        text_col = col
                        break

                for col in df.columns:
                    if any(x in col.lower() for x in ['label', 'class', 'source', 'is_ai']):
                        label_col = col
                        break

                if text_col and label_col:
                    for _, row in df.iterrows():
                        text = str(row[text_col]).strip()
                        label = str(row[label_col]).strip().lower()

                        if text and len(text) > 50:
                            if label in ['human', 'human-written', '0', 'no', 'false']:
                                label = 0
                            elif label in ['ai', 'ai-generated', '1', 'yes', 'true']:
                                label = 1
                            else:
                                continue

                            training_data.append({'text': text, 'label': label})

            except Exception as e:
                print(f"   Warning loading {csv_file.name}: {e}")

        # Load JSON files
        json_files = list(folder.glob('*.json')) + list(folder.glob('*.jsonl'))
        for json_file in json_files:
            try:
                with open(json_file, 'r') as f:
                    for line in f:
                        try:
                            item = json.loads(line)
                            text = item.get('abstract') or item.get('text') or ''
                            if text and len(str(text).strip()) > 50:
                                training_data.append({'text': str(text).strip(), 'label': 0})
                        except:
                            continue

            except Exception as e:
                print(f"   Warning loading {json_file.name}: {e}")

        print(f"   ✓ Loaded {len(training_data)} training samples\n")
        return training_data

    def calibrate(self):
        """Apply Platt scaling calibration."""
        print("🔧 Applying Platt scaling calibration...\n")

        # Load training data for calibration
        training_data = self.load_training_data()

        if not training_data:
            print("   ❌ No training data loaded. Using base model without calibration.\n")
            self.calibrated_model = self.base_model
            return False

        # Extract features
        print("   Extracting features from training data...")
        texts = [item['text'] for item in training_data]
        labels = np.array([item['label'] for item in training_data])

        features_list = []
        for i, text in enumerate(texts):
            if (i + 1) % 5000 == 0:
                print(f"      Processed {i + 1}/{len(texts)}...", end="\r")
            try:
                features = extract_features(text)
                features_list.append(features)
            except:
                features_list.append(np.zeros(13))

        X = np.array(features_list)
        X_scaled = self.scaler.transform(X)

        print(f"\n   ✓ Extracted features for {len(X_scaled)} samples\n")

        # Split into train/calibration sets
        print("   Splitting data for calibration...")
        X_train, X_calib, y_train, y_calib = train_test_split(
            X_scaled, labels, test_size=0.3, random_state=42, stratify=labels
        )
        print(f"   ✓ Train: {len(X_train)}, Calibration: {len(X_calib)}\n")

        # Apply Platt scaling
        print("   Fitting calibration using Platt scaling...")
        self.calibrated_model = CalibratedClassifierCV(
            self.base_model,
            method='sigmoid',  # Platt scaling
            cv='prefit'
        )
        self.calibrated_model.fit(X_calib, y_calib)

        # Evaluate
        train_acc = self.calibrated_model.score(X_train, y_train)
        calib_acc = self.calibrated_model.score(X_calib, y_calib)

        print(f"\n   ✓ Calibration accuracy: {calib_acc:.4f}")
        print(f"   ✓ Training accuracy: {train_acc:.4f}\n")

        return True

    def save_calibrated_model(self, output_path='models/lr_model_calibrated.pkl'):
        """Save calibrated model."""
        print(f"💾 Saving calibrated model to {output_path}...")

        try:
            joblib.dump(self.calibrated_model, output_path)
            print(f"   ✓ Saved calibrated model\n")
            return True
        except Exception as e:
            print(f"   ❌ Error: {e}\n")
            return False

    def evaluate_calibration(self):
        """Show calibration metrics on test data."""
        if not self.calibration_data:
            print("No calibration data loaded.\n")
            return

        print("📊 CALIBRATION EVALUATION")
        print("=" * 60)

        df = pd.DataFrame(self.calibration_data)

        print(f"\nTotal test samples: {len(df)}")
        print(f"AI-generated: {(df['label'] == 1).sum()}")
        print(f"Human-written: {(df['label'] == 0).sum()}")

        # Score distribution
        print(f"\n📈 Score distribution:")
        print(f"   Min: {df['score'].min():.2f}")
        print(f"   Max: {df['score'].max():.2f}")
        print(f"   Mean: {df['score'].mean():.2f}")
        print(f"   Median: {df['score'].median():.2f}")

        # Verdict distribution
        print(f"\n🎯 Verdict distribution:")
        verdicts = df['verdict'].value_counts()
        for verdict, count in verdicts.items():
            pct = (count / len(df) * 100)
            print(f"   {verdict:15s}: {count:2d} ({pct:5.1f}%)")

        print("\n" + "=" * 60 + "\n")

def main():
    """Main calibration pipeline."""
    print("\n" + "=" * 60)
    print("MODEL CALIBRATION WITH PLATT SCALING")
    print("=" * 60 + "\n")

    calibrator = ModelCalibrator()

    # Load models
    if not calibrator.load_models():
        print("❌ Failed to load models. Aborting.\n")
        return

    # Load test data for evaluation
    test_data_path = 'data/ai_detections.json'
    if Path(test_data_path).exists():
        calibrator.load_test_data(test_data_path)

    # Apply Platt scaling
    success = calibrator.calibrate()

    if success:
        # Save calibrated model
        calibrator.save_calibrated_model()

        # Evaluate
        calibrator.evaluate_calibration()

        print("=" * 60)
        print("✅ CALIBRATION COMPLETE!")
        print("=" * 60)
        print(f"\nCalibrated model saved: models/lr_model_calibrated.pkl")
        print(f"Scaler unchanged: models/scaler.pkl")
        print("\nTo use calibrated model, update detector.py to load:")
        print("  _lr_model = joblib.load('models/lr_model_calibrated.pkl')")
        print("\n" + "=" * 60 + "\n")
    else:
        print("⚠️  Calibration failed or incomplete.\n")

if __name__ == "__main__":
    main()
