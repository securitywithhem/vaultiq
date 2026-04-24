# AI Detector — Diagnosis & Retraining Plan

Snapshot from running `scripts/diagnose_demo.py` against the three demo files.

## 1. What the demo run showed

| File | Expected | Score | Verdict | RoBERTa avg | LR avg |
|------|----------|-------|---------|-------------|--------|
| 1_Human_Written.docx | HUMAN | **0.25** | human ✅ | 0.049 | 0.415 |
| 2_Mixed_Content.docx | MIXED | **0.23** | human ❌ | 0.126 | 0.307 |
| 3_AI_Generated.docx  | AI    | **0.10** | human ❌ | 0.129 | 0.081 |

The AI file scored *lower* than the human file. This is a model failure, not a content failure — the AI doc has every classic LLM tell:

- burstiness = 1.59 (very uniform sentence length)
- avg_sent_len = 25.0 (long, consistent)
- passive_ratio = 0.58
- perplexity = 16.3 (low = predictable)
- avg_word_len = 7.83 (formal)

…and the LR still returns 0.08.

## 2. Root cause

### 2a. RoBERTa is the wrong model
`core/detector.py:80` loads `roberta-base-openai-detector`. That model was trained in 2019 on **GPT-2 vs WebText**. It has no signal for modern LLM output (GPT-4, Claude, Gemini). Most chunks from the AI demo get RoBERTa ≈ 0.0.

### 2b. Training data is GPT-2–dominated
`kaggle_unified_dataset.csv` composition:

| source  | label | count  |
|---------|-------|--------|
| gpt2    | AI (1)| 87,005 |
| corpus  | AI (1)| 13,137 |
| webtext | human | 99,858 |

Plus HC3 (~50k ChatGPT pairs). **~68% of the AI class is GPT-2**. GPT-2 is less fluent than modern LLMs, so the LR learned inverted priors:

- low perplexity → looks human (modern LLMs *are* low-perplexity)
- long, coherent sentences → looks human (modern LLMs write them)
- high TTR → looks human (modern LLMs don't repeat like GPT-2)

That's why File 3 — with every human-obvious LLM tell — scores 0.08.

### 2c. Ensemble weights don't rescue it
`ensemble_config.json` has `w_roberta=0.45, w_lr=0.55`. RoBERTa contributes ~0 on modern content, LR contributes ~0.08. Any threshold we pick will misclassify the human doc or the AI doc — they live in the same score range.

### 2d. Verdict thresholds can't be fixed by tuning
`detector.py:409` uses `<0.35 human / 0.35-0.65 mixed / >0.65 ai`. Given current model outputs, 98% of modern AI content lands < 0.35. Lowering the band shifts the false-negative/false-positive tradeoff but doesn't separate the classes.

## 3. Retraining plan

### Phase 1 — Data (required)
Build a modern-LLM AI-text corpus. Target: ~50k samples each.

1. **Generate from current LLMs** via API:
   - Claude 3.5 / Claude 4 (Anthropic API)
   - GPT-4o / GPT-4 Turbo (OpenAI API)
   - Gemini 1.5 Pro (Google API)
2. **Prompt mix**: essay, technical explainer, summary, Q&A, creative — same topics as human corpus so the model doesn't cheat on topic.
3. **Source for paired human text**: keep webtext, HC3 human side, arxiv abstracts, PubMedQA. Add Reddit longform, Wikipedia intros for domain balance.
4. **Downweight GPT-2**: keep it ≤ 15% of AI class (not 68%). It's still useful for robustness but shouldn't dominate.

Public datasets that already ship modern-LLM outputs (use if API budget is tight):
- `MAGE` (Li et al. 2024) — 27 model outputs across 10 domains
- `M4` (Wang et al.) — multilingual, multi-generator
- `RAID` (Dugan et al.) — robustness benchmark
- `GPT-Wiki-Intro` on Kaggle
- `AI-vs-Human-Generated Essays` on Kaggle

### Phase 2 — Features (add 3–4 new ones)
`core/detector.py:extract_features` currently has 13 features. Add:

- **LLM-phrase density**: count of tells — "delve into", "it is important to note", "furthermore", "moreover", "tapestry", "navigate the complex", "realm of", "in conclusion", "leverage", "robust", "seamless". Normalize per 1000 words.
- **Transition-word rate**: Furthermore/Moreover/Additionally/However per sentence.
- **Sentence-length variance (not just ratio)**: raw std-dev, not variance/mean.
- **N-gram repetition**: ratio of repeated 3-grams — LLMs repeat structural phrases more than humans.

These are cheap to compute and give strong signal for modern LLM output even without a transformer.

### Phase 3 — Replace or augment RoBERTa
Three options, rough order of effort:

1. **Drop in a newer open detector** (fastest):
   - `Hello-SimpleAI/chatgpt-detector-roberta`
   - `nealcly/detection-longformer`
   - `desklib/ai-text-detector-v1.01`
   One line change in `detector.py:80`. Re-run ensemble optimizer.

2. **Fine-tune RoBERTa-large on the new corpus** (medium effort):
   - HuggingFace Trainer, ~2–4 hours on a single A10/A100.
   - Much better domain match than using an off-the-shelf checkpoint.

3. **Train from scratch with DeBERTa-v3-base**: better architecture, same effort as #2.

### Phase 4 — Retune ensemble + thresholds
`scripts/optimize_ensemble.py` already exists — re-run it on the new held-out set after phases 1–3. Also retune the verdict bands in `detector.py:detect` based on the new score distribution (likely tighter than 0.35/0.65).

## 4. Short-term workaround (no retraining)

If retraining isn't on the table this week, we can ship a phrase-based shim:

1. Add `llm_phrase_density` feature to `extract_features`.
2. Add a post-hoc rule in `detect()`: if `llm_phrase_density > 0.008` **and** `burstiness < 2.5` **and** `avg_sent_len > 18`, push the chunk score by +0.3.
3. This will correctly flag the current AI demo file without retraining — at the cost of some false positives on formal human writing. Accept it as a demo-only patch; replace with real retraining for production.

## 5. Effort estimates

| Phase | Effort | Impact |
|-------|--------|--------|
| Short-term shim | 1–2h | Fixes demo, hurts precision on formal text |
| Phase 1 (data) | 1–2 days | Biggest single lever |
| Phase 2 (features) | 3–4h | +5–10% F1 on modern LLM text |
| Phase 3 option 1 (swap RoBERTa) | 2–3h | +10–20% on modern LLM text |
| Phase 3 option 2 (fine-tune) | 1 day + GPU | +20–30% |
| Phase 4 (retune) | 2h | Smaller verdict-band fix |

Minimum realistic upgrade: Phase 1 (partial, 10k samples from a modern LLM) + Phase 2 + Phase 3 option 1 + Phase 4. ~3 days end-to-end.
