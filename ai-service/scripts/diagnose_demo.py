"""
diagnose_demo.py — Run the detector against the 3 demo files and print
per-chunk scores, feature values, and verdicts.

Purpose: verify whether the new demo content gets correctly classified,
and expose which features are (or aren't) carrying signal.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Add parent dir to path so we can import core/
sys.path.insert(0, str(Path(__file__).parent.parent))

from core import detector, extractor, preprocessor  # noqa: E402

FEATURE_NAMES = [
    "perplexity", "burstiness", "ttr", "avg_sent_len", "punct_density",
    "word_entropy", "avg_word_len", "proper_noun_density",
    "formal_ratio", "citation_density", "tech_ratio", "passive_ratio", "complex_ratio",
]

DEMO_DIR = Path(__file__).parent.parent.parent / "demo_files"
FILES = [
    ("1_Human_Written.docx", "HUMAN"),
    ("2_Mixed_Content.docx", "MIXED"),
    ("3_AI_Generated.docx", "AI"),
]


def main() -> None:
    print("Loading models...")
    detector.load_models()
    print(f"  dummy_lr = {detector.is_dummy_lr()}")
    print(f"  roberta loaded = {detector._roberta_model is not None}")
    print(f"  gpt2 loaded    = {detector._gpt2_model is not None}")
    print()

    for fname, expected in FILES:
        fpath = DEMO_DIR / fname
        if not fpath.exists():
            print(f"SKIP {fname} (not found)")
            continue

        ext = fpath.suffix.lstrip(".")
        raw = extractor.extract_text(str(fpath), ext)
        chunks = preprocessor.preprocess(raw)

        print("=" * 72)
        print(f"FILE: {fname}   expected={expected}")
        print(f"  chars={len(raw)}  chunks={len(chunks)}")
        print("-" * 72)

        r_scores, l_scores, e_scores = [], [], []
        for i, chunk in enumerate(chunks):
            r = detector.roberta_score(chunk)
            l = detector.lr_score(chunk)
            e = detector._W_ROBERTA * r + detector._W_LR * l
            r_scores.append(r); l_scores.append(l); e_scores.append(e)
            preview = chunk[:60].replace("\n", " ")
            print(f"  chunk {i:2d}  roberta={r:.3f}  lr={l:.3f}  ens={e:.3f}  | {preview}...")

        # Feature vector of full document
        feats = detector.extract_features(raw)
        print("-" * 72)
        print("  full-doc features:")
        for name, val in zip(FEATURE_NAMES, feats):
            print(f"    {name:22s} = {val:.4f}")

        result = detector.detect(chunks)
        print("-" * 72)
        print(f"  VERDICT: {result['verdict']}  score={result['score']}  conf={result['confidence']}")
        print(f"  avg roberta = {sum(r_scores)/len(r_scores):.3f}")
        print(f"  avg lr      = {sum(l_scores)/len(l_scores):.3f}")
        print(f"  avg ens     = {sum(e_scores)/len(e_scores):.3f}")
        print()


if __name__ == "__main__":
    main()
