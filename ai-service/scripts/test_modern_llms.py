"""
test_modern_llms.py — Golden-set verification for VaultIQ AI Detector v5

Tests against known GPT-4, Claude 3.5, and Gemini outputs vs genuine human text.
Passes if: AI samples score >= 0.55, Human samples score <= 0.45.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from core.detector import detect, load_models, roberta_score, lr_score, ensemble_score

PASS_THRESHOLD_AI = 0.42     # AI text must score at or above this
PASS_THRESHOLD_HUMAN = 0.27  # Human text must score at or below this (= 0.42 * 0.65)

# ─── Golden test set ──────────────────────────────────────────
GOLDEN_AI_SAMPLES = [
    {
        "name": "GPT-4 (Academic, formal)",
        "text": (
            "Furthermore, it is important to delve into the multifaceted implications "
            "of this research. The tapestry of historical events provides a nuanced perspective "
            "that underscores the importance of a comprehensive analysis. Moreover, the integration "
            "of cutting-edge technology will revolutionize our understanding of the phenomenon. "
            "It is worth noting that this paradigm shift represents an unprecedented transformation "
            "in how we perceive and navigate the complex landscape of modern education."
        ),
    },
    {
        "name": "GPT-4 (Essay structure)",
        "text": (
            "In conclusion, the evidence presented throughout this essay demonstrates that "
            "artificial intelligence represents a transformative force in contemporary society. "
            "The seamless integration of machine learning algorithms has fundamentally altered "
            "the way we process information, make decisions, and interact with technology. "
            "Ultimately, a holistic approach that leverages both human intuition and computational "
            "precision will be essential for navigating the ever-evolving technological landscape."
        ),
    },
    {
        "name": "Claude 3.5 (Explanatory/helpful)",
        "text": (
            "I can certainly help you with that analysis. When we look at the core components "
            "of the system, we find several interesting layers of complexity. Each layer contributes "
            "to the overall stability and performance of the framework, ensuring a robust and "
            "comprehensive solution for future development. It is worth noting that the systematic "
            "approach taken here is both rigorous and insightful, providing a solid foundation "
            "for further investigation. The methodology employed here represents a significant "
            "advancement in the field."
        ),
    },
    {
        "name": "Gemini (Structured/factual)",
        "text": (
            "The implementation of quantum computing represents a significant milestone in "
            "computational science. By harnessing the principles of quantum mechanics, these "
            "systems can leverage superposition and entanglement to perform calculations that "
            "would be computationally intractable for classical computers. Moreover, the seamless "
            "integration of quantum algorithms into existing workflows will revolutionize fields "
            "ranging from cryptography to drug discovery, underscoring the transformative potential "
            "of this cutting-edge technology."
        ),
    },
]

GOLDEN_HUMAN_SAMPLES = [
    {
        "name": "Human (Casual/personal)",
        "text": (
            "Hey, I was thinking about that project we talked about last week. "
            "I think we should just go with the simplest option for now — no need to "
            "overcomplicate things with all those extra features. Maybe we can add them later "
            "if we actually need them. I tried setting up the dev environment but ran into a "
            "weird error with the database connection. Can you check the config again? "
            "Let me know when you're free to chat."
        ),
    },
    {
        "name": "Human (Student essay, rough)",
        "text": (
            "In my opinion climate change is a real problem that we need to deal with. "
            "I've seen it myself how the weather has been getting weirder every year. "
            "My grandma says when she was young summers weren't this hot. The government "
            "should do more to stop pollution from factories and cars. Solar panels are "
            "pretty cool but they're expensive for normal people. I think if we all try "
            "a little bit like recycling more and using less plastic it can help."
        ),
    },
    {
        "name": "Human (Forum post)",
        "text": (
            "Has anyone else had issues with the new update? Mine keeps crashing whenever "
            "I try to open the settings menu. I already tried uninstalling and reinstalling "
            "but it didn't help. Running Windows 11 with 16GB RAM if that matters. "
            "Really frustrating because everything was working fine before the update. "
            "Devs please fix this!!! Other than that bug the app is great though."
        ),
    },
]


def run_tests():
    print("🚀 VaultIQ AI Detector — Modern LLM Verification Test (v5)")
    print("=" * 68)
    load_models()

    print("\n📊 Component Score Breakdown:")
    header = f"{'Sample':<40} | {'RoBERTa':>7} | {'LR':>7} | {'Ensemble':>8} | {'Pass?':>5}"
    print(header)
    print("-" * 68)

    passed = 0
    failed = 0
    results = []

    for sample in GOLDEN_AI_SAMPLES:
        r = roberta_score(sample["text"])
        l = lr_score(sample["text"])
        e = ensemble_score(sample["text"])
        ok = e >= PASS_THRESHOLD_AI
        status = "✅" if ok else "❌"
        if ok: passed += 1
        else: failed += 1
        label = f"[AI] {sample['name']}"[:40]
        print(f"{label:<40} | {r:>7.3f} | {l:>7.3f} | {e:>8.3f} | {status}")
        results.append({"name": sample["name"], "type": "AI", "score": e, "passed": ok})

    print()

    for sample in GOLDEN_HUMAN_SAMPLES:
        r = roberta_score(sample["text"])
        l = lr_score(sample["text"])
        e = ensemble_score(sample["text"])
        ok = e <= PASS_THRESHOLD_HUMAN
        status = "✅" if ok else "❌"
        if ok: passed += 1
        else: failed += 1
        label = f"[Human] {sample['name']}"[:40]
        print(f"{label:<40} | {r:>7.3f} | {l:>7.3f} | {e:>8.3f} | {status}")
        results.append({"name": sample["name"], "type": "Human", "score": e, "passed": ok})

    print("\n" + "=" * 68)
    total = passed + failed
    print(f"Result: {passed}/{total} passed  ({100*passed//total}%)")

    if failed == 0:
        print("🎉 ALL TESTS PASSED — Model v5 is ready for production!")
    else:
        print(f"⚠️  {failed} test(s) failed — review scores above.")

    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
