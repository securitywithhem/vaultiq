# Academic Data Retraining - Implementation Summary

**Date:** 2026-04-18  
**Status:** Ready for execution (pending synthetic data generation)

## Overview

VaultIQ's AI detection model is being improved through domain-specific retraining. The enhancement focuses on academic submissions (lab reports, essays, assignments) where the original general-purpose model showed lower confidence levels.

## Problem Statement

**Original Model Performance:**
- Overall accuracy: 94.2%
- Issue: Low confidence ("medium" level) on academic submissions
- Cause: Training data (Kaggle) primarily general domain, not academic-specific

**Target State:**
- Maintain 94%+ overall accuracy
- Increase "high" confidence predictions on academic content by 50%+
- Domain-specific optimization for educational use case

## Solution Architecture

### Data Strategy
```
Training Data = 75% General (Kaggle) + 25% Academic (Synthetic)
                15,000 examples   +   250 examples
                                    = 15,250 total
```

**Academic Distribution:**
- 40% Lab Reports (100 examples)
- 30% Essays (75 examples)
- 20% Assignments (50 examples)
- 10% Research Papers (25 examples)

### Model Pipeline
```
Synthetic Data Generation (Claude API)
    ↓ [250 academic examples]
Combine with Kaggle Data (75/25 split)
    ↓ [15,250 total examples]
Feature Extraction (8 statistical features)
    ↓ [Extract from all texts]
Logistic Regression Training
    ↓ [Train on 15,250 examples]
New Model + Scaler (saved to models/)
    ↓ [Backup old, save new]
Validation on 16 Real Samples
    ↓ [Compare old vs. new confidence]
Production Deployment
    ↓ [Restart AI service with new model]
Monitor (24-48 hours)
    ↓ [Track confidence distribution, false positives]
Phase 2 Optional (RoBERTa fine-tuning)
```

## Implementation Progress

| Task | Status | Details |
|------|--------|---------|
| 1. Generate script | ✅ Complete | `scripts/generate_academic_data.py` |
| 2. Generate data | ⏳ Pending | Needs API key, 45-60 min runtime |
| 3. Retrain script | ✅ Complete | `scripts/retrain_lr_academic.py` |
| 4. Run retrain | ⏳ Pending | Depends on Task 2 |
| 5. Validation script | ✅ Complete | `scripts/validate_retrain.py` |
| 6. Run validation | ⏳ Pending | Depends on Task 4 |
| 7. Deployment prep | ✅ Complete | `DEPLOYMENT_GUIDE.md`, rollback script |
| 8. Monitoring setup | ✅ Complete | `monitor_detections.py`, documentation |

## Expected Outcomes

### Validation Targets (Task 6)
- **Success Criteria:** 50%+ of academic samples improve confidence
- **Expected:** 12/16 samples improve to "high" confidence (75%)
- **Accuracy:** Maintain 94.2%+ on test set

### Deployment Timeline
| Phase | Duration | Start | Complete |
|-------|----------|-------|----------|
| Synthetic data generation | 45-60 min | Task 2 | Task 2 |
| Model retraining | 15-20 min | Task 4 | Task 4 |
| Validation testing | 5 min | Task 6 | Task 6 |
| Production deployment | 5 min | Task 7 | Task 7 |
| Post-deployment monitoring | 24-48 hours | Task 8 | Ongoing |

**Total execution time:** ~2-2.5 hours (once API key provided)

## Rollback & Safety

**Rollback Time:** < 2 minutes

**Backup Strategy:**
- Old model backed up automatically during Task 4 retraining
- Backup location: `models/lr_model.pkl.bak`
- Rollback procedure: `cp models/lr_model.pkl.bak models/lr_model.pkl && docker-compose restart ai-service`

**Health Checks:**
- Service health endpoint: `GET /health`
- Model load verification: Check `model_loaded: true` in response
- Test detection: POST with sample file to `/detect` endpoint

## Monitoring & Operations

**24-48 Hour Post-Deployment Monitoring:**
1. Watch `backend/data/ai_detections.json` for new submissions
2. Compare confidence levels vs. pre-deployment baseline
3. Spot-check verdicts for accuracy
4. Monitor API response time (target: <1000ms per file)
5. Check error logs for anomalies

**Monitoring Script:**
```bash
python3 ai-service/scripts/monitor_detections.py
```

Displays:
- Total detections in period
- Verdict distribution (human/mixed/ai_generated)
- Confidence distribution (high/medium/low)
- Score statistics (avg, min, max)
- High confidence percentage

## Future Enhancements

### Phase 2: RoBERTa Fine-Tuning (Optional)
- Train RoBERTa on same 250 academic examples
- Runtime: 8-12 hours (overnight job)
- Expected gain: +1-2% accuracy
- Timeline: Deploy after Phase 1 validated (1-2 weeks)

### Phase 3: Continuous Improvement
- Collect real labeled academic submissions
- Retrain quarterly on actual domain data
- A/B test model versions
- User feedback loop integration

## Technical Details

### Feature Extraction (8 Statistical Features)
1. Perplexity proxy (n-gram overlap)
2. Burstiness (sentence length variance)
3. Type-Token Ratio (vocabulary diversity)
4. Average sentence length
5. Punctuation density
6. Word frequency entropy
7. Average word length
8. Named entity density

### Model Training
- Algorithm: Logistic Regression (sklearn)
- Solver: LBFGS
- Max iterations: 1000
- Normalization: StandardScaler [0, 1]
- Random state: 42 (reproducibility)

### Inference Ensemble
```
Final Score = 0.7 × RoBERTa_score + 0.3 × LR_score
Confidence = {
  "high" if score > 0.70,
  "medium" if 0.40 < score ≤ 0.70,
  "low" if score ≤ 0.40
}
```

## Success Criteria

✅ **Project Success = All of:**
1. Task 2: 250 synthetic examples generated
2. Task 4: Model retrained, accuracy ≥94.2%
3. Task 6: Validation passed (50%+ improvement)
4. Task 7: Deployed to production without errors
5. Task 8: Monitoring shows stable performance (24h)
6. No false positive surge post-deployment
7. Confidence distribution improved per specification

## Dependencies & Blockers

**Required for execution:**
- Anthropic API key (for Task 2 synthetic data generation)
- 1-2 hours compute time
- Existing Kaggle dataset at `datasets/kaggle_unified_dataset.csv`
- Running AI service for deployment testing

**Currently blocked on:**
- API key availability (user responsibility)

## References

- **Design spec:** `docs/superpowers/specs/2026-04-18-improve-model-accuracy-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-04-18-improve-model-accuracy.md`
- **Deployment guide:** `ai-service/DEPLOYMENT_GUIDE.md`
- **Integration status:** `ai-service/INTEGRATION_STATUS.md`

---

**Next action:** User provides Anthropic API key → Execute Task 2 (synthetic data generation)
