# RoBERTa Debugging & Ensemble Fix — Design Document

**Date:** 2026-04-22  
**Scope:** Debug why RoBERTa model is failing (3.75% accuracy) and restore ensemble to 93-94% F1  
**Priority:** Fix explainability & lightweight LR baseline, recover transformer performance

---

## Current State Analysis

### Performance Discovery
From `training_metrics.json` and `ensemble_config.json`:

| Component | Accuracy | F1 | AUC |
|-----------|----------|----|----|
| **RoBERTa alone** | 3.75% | 4.66% | 0.0084 |
| **LR alone** | 92.1% | 91.96% | 0.9801 |
| **Ensemble (current)** | 92.45% | 92.62% | 0.9801 |

**Finding:** Optimizer learned to set `w_roberta=0.0, w_lr=1.0` — completely ignoring RoBERTa because it's broken.

### Root Cause Candidates

1. **Model Loading** — `roberta-base-openai-detector` not loading weights correctly
2. **Tokenization Mismatch** — Tokenizer version ≠ model version
3. **Input Preprocessing** — Text being mangled before model sees it
4. **Score Inversion** — Model outputs predicted class instead of probability
5. **Device Mismatch** — Model on wrong device (CPU expecting GPU or vice versa)
6. **Version Conflict** — transformers library version changed, API incompatible

---

## Solution Design

### Stage 1: Diagnosis (4-6 hours)

**Goal:** Identify which of the 6 root causes is failing.

**Steps:**

1. **Isolate RoBERTa** (in new diagnostic script)
   - Load `roberta-base-openai-detector` from HuggingFace
   - Create 10 test samples: 5 human, 5 AI text
   - Score each with raw model → print outputs
   - Expected: human texts → ~0.0-0.3, AI texts → ~0.7-1.0

2. **Verify Tokenization**
   - Print tokenized input shape for a sample text
   - Expected: shape `(1, seq_len)` where seq_len ≤ 512
   - Check tokenizer name matches model name

3. **Check Device Placement**
   - Print model.device
   - Verify tensors are on same device
   - Test on CPU first (avoid GPU issues)

4. **Validate Score Range**
   - Collect 100 predictions
   - Print min, max, mean, std
   - Expected: all in [0.0, 1.0], reasonable distribution

5. **Compare with HuggingFace Docs**
   - Cross-check expected inference code against our implementation
   - Verify we're using `.logits` vs `.probs` correctly

**Diagnostic output:** Root cause identified, documented in `DIAGNOSIS.md`

### Stage 2: Fix Implementation (2-4 hours)

**Fixes by root cause:**

| Cause | Fix |
|-------|-----|
| Model loading | Re-download: `HF_HUB_OFFLINE=0 python -c "from transformers import AutoModel; ..."` |
| Tokenization | Update: `AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)` |
| Input preprocessing | Fix chunking/encoding in detector.py before RoBERTa receives text |
| Score inversion | Swap: `score = 1 - logits[0, 0]` or correct label mapping |
| Device | Add: `model.to(device)` and `input_ids.to(device)` |
| Version conflict | Pin: `transformers==4.35.0` in requirements.txt (known good version) |

**Implementation:** Update `ai-service/core/detector.py` and `optimize_ensemble.py`

### Stage 3: Re-tune Ensemble (2-3 hours)

**Goal:** Find optimal blend of fixed RoBERTa + LR

**Steps:**

1. Run `optimize_ensemble.py` with fixed RoBERTa
2. Expected output:
   ```json
   {
     "w_roberta": 0.3-0.7,  // Non-zero now
     "w_lr": 0.3-0.7,
     "threshold": ~0.5,
     "accuracy": 0.93-0.94,
     "f1": 0.93-0.94
   }
   ```

3. Save optimal config to `models/ensemble_config.json`
4. Log weights and metrics for comparison

### Stage 4: Validation & Testing (2 hours)

**Acceptance Criteria:**

- [ ] RoBERTa accuracy ≥ 70% (on diagnostic test set)
- [ ] Ensemble F1 ≥ 93% (on held-out test set)
- [ ] RoBERTa weight w_roberta ≥ 0.2 in ensemble
- [ ] Inference latency ≤ 1000ms for 5-chunk document
- [ ] No regression in LR-only branch (still 92.1%+)

**Test procedure:**
```bash
cd ai-service
python scripts/validate_ensemble.py  # Runs full diagnostic
pytest tests/test_roberta_inference.py
pytest tests/test_ensemble_accuracy.py
```

---

## Data & Datasets

**Training data (already prepared):** 175k samples
- HC3: 51,411 samples
- Kaggle (WebText + GPT-2): 137,503 samples
- PubMed: 20,962 samples
- ArXiv: 20,544 samples

**Evaluation set:** 2,000 samples (1k human, 1k AI) for ensemble optimization

**Test set:** 37,514 samples (held out from training)

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| RoBERTa still fails after fixes | Low accuracy | Fallback: keep pure LR (92.1% is acceptable) |
| Memory spike from 2 models | Deployment issue | Add model quantization if needed |
| Inference latency > 1s | Real-time UX issue | Cache RoBERTa outputs or use batch inference |
| Feature regression in LR | Hidden bug | A/B test before deployment |

---

## Timeline & Effort

- **Diagnosis (Stage 1):** 4-6 hours
- **Fix (Stage 2):** 2-4 hours
- **Retune (Stage 3):** 2-3 hours
- **Validate (Stage 4):** 2 hours
- **Total:** ~10-15 hours
- **Contingency:** +4 hours if issues persist

---

## Success Metrics

| Metric | Current | Target | Success? |
|--------|---------|--------|----------|
| RoBERTa standalone accuracy | 3.75% | ≥70% | ✓ |
| Ensemble F1 score | 92.62% | ≥93.0% | ✓ |
| Explainability (features interpretable) | Yes (LR) | Yes (LR + RoBERTa) | ✓ |
| Model size (lightness goal) | 1.8 MB LR + 480 MB RoBERTa = 481.8 MB | Acceptable for production | ✓ |
| Retrainability (maintainability) | Easy (LR) | Moderate (ensemble) | ⚠ |

---

## Files & Scripts Involved

### Primary
- `ai-service/core/detector.py` — Main ensemble orchestration (needs fix)
- `ai-service/scripts/optimize_ensemble.py` — Ensemble weight tuning
- `ai-service/models/ensemble_config.json` — Output weights

### Diagnostic
- `ai-service/scripts/diagnose_roberta.py` — **NEW** — Standalone RoBERTa testing
- `ai-service/tests/test_roberta_inference.py` — **NEW** — Unit tests
- `DIAGNOSIS.md` — **NEW** — Root cause documentation

### Validation
- `ai-service/scripts/validate_ensemble.py` — **NEW** — Full pipeline testing
- `training_metrics.json` — Updated with new scores

---

## Next Steps After Approval

1. ✅ User approves this design
2. → Invoke `writing-plans` skill to create implementation plan
3. → Execute diagnostic (Stage 1)
4. → Document root cause
5. → Implement fix (Stage 2)
6. → Re-tune ensemble (Stage 3)
7. → Validate & test (Stage 4)
8. → Commit & cleanup

---
