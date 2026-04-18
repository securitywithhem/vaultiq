"""
Validate retrained LR model on 16 real academic samples.
Compare old vs. new model confidence levels and verdicts.
"""

import json
import pickle
import sys
from pathlib import Path
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.detector import extract_features, load_models

def load_old_model():
    """Load backed up old model for comparison."""
    backup_path = Path('models/lr_model.pkl.bak')
    if not backup_path.exists():
        print("⚠️  Old model backup not found. Cannot compare.")
        return None

    with open(backup_path, 'rb') as f:
        return pickle.load(f)

def load_new_model():
    """Load newly trained model."""
    model_path = Path('models/lr_model.pkl')
    scaler_path = Path('models/scaler.pkl')

    with open(model_path, 'rb') as f:
        model = pickle.load(f)

    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)

    return model, scaler

def load_validation_samples():
    """Load 16 real academic samples from detection history."""
    json_path = Path('../../backend/data/ai_detections.json')

    if not json_path.exists():
        print(f"⚠️  Validation file not found at {json_path}")
        return []

    with open(json_path, 'r') as f:
        data = json.load(f)

    return data['detections']

def predict_with_model(text, model, scaler, roberta_score=None):
    """
    Predict using LR model and combine with RoBERTa (if available).
    Returns score (0-1) and confidence level.
    """
    features = extract_features(text)
    features_scaled = scaler.transform([features])[0]

    # Get LR probability
    lr_prob = model.predict_proba([features_scaled])[0][1]  # P(ai)

    # If RoBERTa score available, use ensemble (70% RoBERTa + 30% LR)
    if roberta_score is not None:
        ensemble_score = 0.7 * roberta_score + 0.3 * lr_prob
    else:
        ensemble_score = lr_prob

    # Map score to confidence
    if ensemble_score > 0.7:
        confidence = "high"
    elif ensemble_score > 0.4:
        confidence = "medium"
    else:
        confidence = "low"

    return ensemble_score, confidence

def get_verdict(score):
    """Map score to verdict."""
    if score > 0.7:
        return "ai_generated"
    elif score > 0.4:
        return "mixed"
    else:
        return "human"

def main():
    """Validate retrained model on real samples."""
    print("=" * 70)
    print("Validation: Retrained LR Model on Real Academic Samples")
    print("=" * 70)

    # Load models
    print("\n📦 Loading models...")
    old_model = load_old_model()
    new_model, scaler = load_new_model()
    print("  ✓ Models loaded")

    # Load validation samples
    print("\n📂 Loading validation samples...")
    samples = load_validation_samples()
    print(f"  ✓ Loaded {len(samples)} detection samples")

    if len(samples) == 0:
        print("❌ No validation samples available")
        return

    # Create comparison table
    print("\n" + "=" * 70)
    print("COMPARISON: Old Model vs. New Model")
    print("=" * 70)

    improvements = 0
    regressions = 0

    for i, sample in enumerate(samples, 1):
        text_preview = sample['filename'][:50]
        old_verdict = sample['verdict']
        old_score = sample['score']
        old_confidence = sample['confidence']

        # New model prediction (using LR only for fair comparison, no RoBERTa)
        try:
            new_score, new_confidence = predict_with_model(text_preview, new_model, scaler)
            new_verdict = get_verdict(new_score)

            # Track improvements
            if old_confidence != "high" and new_confidence == "high":
                improvements += 1
                status = "✅ IMPROVED"
            elif old_confidence == "high" and new_confidence != "high":
                regressions += 1
                status = "❌ REGRESSED"
            else:
                status = "➡️  SAME"

            print(f"\n{i}. {text_preview}")
            print(f"   Old: verdict={old_verdict:12} score={old_score:.2f} confidence={old_confidence:6} {status}")
            print(f"   New: verdict={new_verdict:12} score={new_score:.2f} confidence={new_confidence:6}")

        except Exception as e:
            print(f"\n{i}. {text_preview}")
            print(f"   ⚠️  Error processing: {e}")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Total samples: {len(samples)}")
    print(f"Improvements: {improvements} ({improvements/len(samples)*100:.1f}%)")
    print(f"Regressions: {regressions} ({regressions/len(samples)*100:.1f}%)")
    print(f"Same confidence: {len(samples) - improvements - regressions}")

    # Success criteria
    target_improvements = len(samples) * 0.5  # 50% improvement
    if improvements >= target_improvements:
        print(f"\n✅ VALIDATION PASSED: {improvements}+ improvements >= target {int(target_improvements)}")
        return True
    else:
        print(f"\n❌ VALIDATION FAILED: {improvements} improvements < target {int(target_improvements)}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
