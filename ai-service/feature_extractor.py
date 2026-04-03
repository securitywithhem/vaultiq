import re
import string
import numpy as np
from typing import Dict, List

CONTRACTIONS = [
    "don't", "can't", "it's", "won't", "isn't", "aren't",
    "wasn't", "weren't", "haven't", "hasn't", "didn't", "wouldn't", "couldn't",
    "shouldn't", "i'm", "i've", "i'll", "i'd", "you're", "you've", "you'll",
    "they're", "they've", "we're", "we've", "he's", "she's", "that's", "there's",
    "what's", "who's", "let's", "here's"
]

FEATURE_ORDER = [
    'avg_sentence_length', 'sentence_length_std',
    'type_token_ratio', 'avg_word_length', 'punctuation_density',
    'contraction_rate', 'paragraph_uniformity', 'bigram_repetition_rate'
]

def extract_features(text: str) -> Dict[str, float]:
    """
    Extracts 8 stylometric and statistical signals from the provided text.
    
    1. avg_sentence_length: Measures the average number of words per sentence.
    2. sentence_length_std: Measures the variability (burstiness) of sentence lengths.
    3. type_token_ratio: Measures vocabulary richness (unique words / total words).
    4. avg_word_length: Measures the average character count per word.
    5. punctuation_density: Measures the frequency of punctuation characters.
    6. contraction_rate: Measures how often contractions are used (human signal).
    7. paragraph_uniformity: Measures the variance in paragraph lengths.
    8. bigram_repetition_rate: Measures the rate of repeating pairs of words (AI signal).
    """
    if not text or not text.strip():
        return {k: 0.0 for k in FEATURE_ORDER}

    # Sentence splitting
    sentences = [s.strip() for s in re.split(r'\. |\! |\? ', text) if s.strip()]
    sentence_word_counts = [len(s.split()) for s in sentences]
    
    if not sentence_word_counts:
        avg_sentence_length = 0.0
        sentence_length_std = 0.0
    else:
        avg_sentence_length = np.mean(sentence_word_counts)
        sentence_length_std = np.std(sentence_word_counts)

    # Word handling
    words = text.lower().split()
    total_words = len(words)
    
    if total_words == 0:
        type_token_ratio = 0.0
        avg_word_length = 0.0
        contraction_rate = 0.0
        bigram_repetition_rate = 0.0
    else:
        # FEATURE 3: Type-Token Ratio
        type_token_ratio = len(set(words)) / total_words
        
        # FEATURE 4: Avg Word Length
        avg_word_length = sum(len(word) for word in words) / total_words
        
        # FEATURE 6: Contraction Rate
        text_lower = text.lower()
        contraction_count = sum(1 for c in CONTRACTIONS if c in text_lower)
        contraction_rate = contraction_count / total_words
        
        # FEATURE 8: Bigram Repetition Rate
        words_clean = [w.strip(string.punctuation).lower() for w in words if any(c.isalpha() for c in w)]
        bigrams = [(words_clean[i], words_clean[i+1]) for i in range(len(words_clean)-1)]
        
        if not bigrams:
            bigram_repetition_rate = 0.0
        else:
            unique_bigrams = len(set(bigrams))
            bigram_repetition_rate = 1 - (unique_bigrams / len(bigrams))

    # FEATURE 5: Punctuation Density
    punct_count = sum(1 for c in text if c in string.punctuation)
    punctuation_density = punct_count / len(text) if len(text) > 0 else 0.0

    # FEATURE 7: Paragraph Uniformity
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    if len(paragraphs) < 2:
        paragraph_uniformity = 0.0
    else:
        para_lengths = [len(p.split()) for p in paragraphs]
        # np.std / (np.mean + 1) to normalize
        paragraph_uniformity = np.std(para_lengths) / (np.mean(para_lengths) + 1)

    return {
        'avg_sentence_length': round(float(avg_sentence_length), 4),
        'sentence_length_std': round(float(sentence_length_std), 4),
        'type_token_ratio': round(float(type_token_ratio), 4),
        'avg_word_length': round(float(avg_word_length), 4),
        'punctuation_density': round(float(punctuation_density), 4),
        'contraction_rate': round(float(contraction_rate), 4),
        'paragraph_uniformity': round(float(paragraph_uniformity), 4),
        'bigram_repetition_rate': round(float(bigram_repetition_rate), 4)
    }

def features_to_array(features: Dict[str, float]) -> np.ndarray:
    """
    Converts features dictionary to a numpy array for model input.
    Ensures feature order is preserved.
    """
    return np.array([[features[k] for k in FEATURE_ORDER]])
