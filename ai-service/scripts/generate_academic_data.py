"""
Generate synthetic academic examples for AI detection model retraining.
Uses Claude API to create balanced human/AI academic content.
"""

import csv
import json
import os
from anthropic import Anthropic

# Initialize Anthropic client
client = Anthropic()

# Academic content prompts (10 per category for variety)
PROMPTS = {
    "lab_report": [
        "Write a lab report on the effects of pH on enzyme activity",
        "Write a lab report on measuring the focal length of a converging lens",
        "Write a lab report on the analysis of an unknown organic compound using IR spectroscopy",
        "Write a lab report documenting a titration experiment to find acid concentration",
        "Write a lab report on investigating the relationship between voltage and current in a resistor",
        "Write a lab report on identifying bacteria species using Gram staining",
        "Write a lab report on determining the hardness of water samples",
        "Write a lab report on measuring the rate of a chemical reaction with different catalysts",
        "Write a lab report on analyzing the composition of an alloy using flame test",
        "Write a lab report on investigating heat transfer through different materials",
    ],
    "essay": [
        "Write a 500-word essay about the impact of climate change on global economies",
        "Write a 500-word essay analyzing the themes of identity and belonging in modern literature",
        "Write a 500-word essay on the role of artificial intelligence in healthcare",
        "Write a 500-word essay examining the causes and effects of income inequality",
        "Write a 500-word essay on the importance of renewable energy sources",
        "Write a 500-word essay analyzing the pros and cons of social media",
        "Write a 500-word essay on the evolution of human communication technology",
        "Write a 500-word essay examining the cultural significance of a major historical event",
        "Write a 500-word essay on the future of education in the digital age",
        "Write a 500-word essay analyzing a significant scientific breakthrough",
    ],
    "assignment": [
        "Write an assignment solution explaining how binary search works with a Python implementation",
        "Write an assignment about designing a database schema for an e-commerce platform",
        "Write an assignment solution for a problem-solving task about network routing algorithms",
        "Write an assignment on the principles of object-oriented programming with examples",
        "Write an assignment explaining the concept of machine learning and its applications",
        "Write an assignment about cybersecurity best practices for web applications",
        "Write an assignment on data visualization techniques and when to use them",
        "Write an assignment explaining cloud computing architecture and deployment models",
        "Write an assignment on version control systems and collaborative development",
        "Write an assignment about the fundamentals of API design and REST principles",
    ],
    "research_paper": [
        "Write an abstract and introduction for a research paper on deep learning applications in medical imaging",
        "Write an abstract and introduction for a research paper on quantum computing algorithms",
        "Write an abstract and introduction for a research paper on sustainable urban planning",
        "Write an abstract and introduction for a research paper on novel materials for battery technology",
        "Write an abstract and introduction for a research paper on linguistic patterns in social media",
        "Write an abstract and introduction for a research paper on climate modeling and predictions",
        "Write an abstract and introduction for a research paper on genetic engineering ethical implications",
        "Write an abstract and introduction for a research paper on autonomous vehicle safety",
        "Write an abstract and introduction for a research paper on supply chain optimization",
        "Write an abstract and introduction for a research paper on pandemic response systems",
    ]
}

def generate_human_content(category, prompt):
    """Generate human-like academic content using Claude."""
    conversation_history = []

    # First message: ask Claude to write as a student
    conversation_history.append({
        "role": "user",
        "content": prompt + "\n\nWrite in a natural, student-like tone with realistic patterns of thinking (some hesitation, rephrasing). Include domain-specific vocabulary but keep it accessible."
    })

    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1500,
        messages=conversation_history
    )

    content = response.content[0].text
    conversation_history.append({
        "role": "assistant",
        "content": content
    })

    return content

def generate_ai_content(category, prompt):
    """Generate AI-like academic content using Claude."""
    conversation_history = []

    # Ask Claude to write as an AI would - more polished, structured
    conversation_history.append({
        "role": "user",
        "content": prompt + "\n\nWrite in a polished, formal academic tone with clear structure and perfect grammar. This should be what an AI language model would produce."
    })

    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1500,
        messages=conversation_history
    )

    content = response.content[0].text
    conversation_history.append({
        "role": "assistant",
        "content": content
    })

    return content

def main():
    """Generate 1000 synthetic academic examples (500 human + 500 AI)."""
    output_file = "datasets/academic_synthetic.csv"

    # Distribution: 40% lab reports, 30% essays, 20% assignments, 10% research papers
    distribution = {
        "lab_report": 400,
        "essay": 300,
        "assignment": 200,
        "research_paper": 100
    }

    examples = []
    total_generated = 0

    print("=" * 60)
    print("Generating 1,000 Synthetic Academic Examples")
    print("=" * 60)

    for category, count in distribution.items():
        print(f"\n📝 {category.upper()}: Generating {count} examples ({count//2} human + {count//2} AI)")

        prompts = PROMPTS[category]
        examples_per_prompt = (count // 2) // len(prompts)

        for i, prompt in enumerate(prompts):
            # Generate human examples
            for j in range(examples_per_prompt):
                print(f"  Generating human example {j+1}/{examples_per_prompt}...", end="\r")
                text = generate_human_content(category, prompt)
                examples.append({
                    "text": text,
                    "label": "human",
                    "category": category,
                    "prompt_id": i
                })
                total_generated += 1

            # Generate AI examples
            for j in range(examples_per_prompt):
                print(f"  Generating AI example {j+1}/{examples_per_prompt}...", end="\r")
                text = generate_ai_content(category, prompt)
                examples.append({
                    "text": text,
                    "label": "ai",
                    "category": category,
                    "prompt_id": i
                })
                total_generated += 1

        print(f"  ✓ {category}: {count} examples generated")

    # Write to CSV
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['text', 'label', 'category', 'prompt_id'])
        writer.writeheader()
        writer.writerows(examples)

    print(f"\n{'=' * 60}")
    print(f"✅ Complete! Generated {total_generated} examples")
    print(f"📁 Saved to: {output_file}")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
