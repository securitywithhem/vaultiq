"""
similarity.py — Plagiarism Similarity Engine
Implements TF-IDF vectorization, cosine similarity, Jaccard similarity (3-grams),
and sentence-level matching for plagiarism detection.
"""

import re
import math
import string
from collections import Counter
from typing import Dict, List, Tuple, Any

# ─── Stop words to filter during tokenization ───
STOP_WORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare',
    'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
    'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
    'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'where',
    'when', 'why', 'how', 'not', 'no', 'nor', 'as', 'if', 'then',
    'than', 'too', 'very', 'just', 'about', 'above', 'after', 'again',
    'all', 'also', 'am', 'any', 'because', 'before', 'between', 'both',
    'each', 'few', 'more', 'most', 'other', 'over', 'same', 'some',
    'such', 'into', 'through', 'during', 'out', 'up', 'down', 'off',
    'only', 'own', 'so'
}


def _tokenize(text: str) -> List[str]:
    """
    Tokenizes text: lowercases, removes punctuation, filters stop words,
    and removes tokens shorter than 3 characters.
    """
    text = text.lower()
    text = text.translate(str.maketrans('', '', string.punctuation))
    tokens = text.split()
    return [t for t in tokens if t not in STOP_WORDS and len(t) >= 3]


def _compute_tf(tokens: List[str]) -> Dict[str, float]:
    """Compute term frequency for a list of tokens."""
    counts = Counter(tokens)
    total = len(tokens)
    if total == 0:
        return {}
    return {term: count / total for term, count in counts.items()}


def _compute_idf(documents: List[List[str]]) -> Dict[str, float]:
    """Compute inverse document frequency across a corpus of tokenized documents."""
    n_docs = len(documents)
    if n_docs == 0:
        return {}

    df = Counter()
    for doc_tokens in documents:
        unique_terms = set(doc_tokens)
        for term in unique_terms:
            df[term] += 1

    return {term: math.log(n_docs / (1 + count)) for term, count in df.items()}


def _tfidf_vector(tokens: List[str], idf: Dict[str, float]) -> Dict[str, float]:
    """Compute TF-IDF vector for a single document given pre-computed IDF values."""
    tf = _compute_tf(tokens)
    return {term: tf_val * idf.get(term, 0.0) for term, tf_val in tf.items()}


def _cosine_similarity(vec_a: Dict[str, float], vec_b: Dict[str, float]) -> float:
    """
    Compute cosine similarity between two TF-IDF vectors.
    Returns 0.0 for empty vectors (no crash).
    """
    if not vec_a or not vec_b:
        return 0.0

    all_terms = set(vec_a.keys()) | set(vec_b.keys())
    dot_product = sum(vec_a.get(t, 0.0) * vec_b.get(t, 0.0) for t in all_terms)
    mag_a = math.sqrt(sum(v ** 2 for v in vec_a.values()))
    mag_b = math.sqrt(sum(v ** 2 for v in vec_b.values()))

    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0

    return dot_product / (mag_a * mag_b)


def _get_ngrams(text: str, n: int = 3) -> set:
    """Generate character n-grams from text."""
    text = text.lower().strip()
    if len(text) < n:
        return set()
    return {text[i:i + n] for i in range(len(text) - n + 1)}


def _jaccard_similarity(text_a: str, text_b: str) -> float:
    """
    Compute Jaccard similarity using character 3-grams.
    Returns 0.0 for empty inputs.
    """
    ngrams_a = _get_ngrams(text_a, 3)
    ngrams_b = _get_ngrams(text_b, 3)

    if not ngrams_a or not ngrams_b:
        return 0.0

    intersection = ngrams_a & ngrams_b
    union = ngrams_a | ngrams_b

    return len(intersection) / len(union)


def _split_sentences(text: str) -> List[str]:
    """Split text into sentences."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if len(s.strip()) > 10]


def _find_matching_segments(
    source_text: str, 
    corpus_text: str, 
    threshold: float = 0.50
) -> List[Dict[str, Any]]:
    """
    Find sentence-level matches between source and corpus text.
    Returns sentences with Jaccard similarity >= threshold.
    """
    source_sentences = _split_sentences(source_text)
    corpus_sentences = _split_sentences(corpus_text)
    matches = []

    for s_sent in source_sentences:
        best_match = None
        best_score = 0.0

        for c_sent in corpus_sentences:
            score = _jaccard_similarity(s_sent, c_sent)
            if score > best_score:
                best_score = score
                best_match = c_sent

        if best_score >= threshold and best_match:
            matches.append({
                'source_sentence': s_sent,
                'matched_sentence': best_match,
                'similarity': round(best_score, 4)
            })

    return matches


def compare(text: str, corpus_texts: Dict[str, str]) -> Tuple[float, float, List[Dict]]:
    """
    Compare a text against all documents in the corpus.
    
    Args:
        text: The document text to check
        corpus_texts: Dict of {doc_id: text} for all corpus documents
        
    Returns:
        (cosine_score, jaccard_score, matched_segments)
        - cosine_score: Highest cosine similarity found (0.0 - 1.0)
        - jaccard_score: Highest Jaccard similarity found (0.0 - 1.0)
        - matched_segments: List of sentence-level matches from the best match
    """
    if not corpus_texts:
        return (0.0, 0.0, [])

    # Tokenize all documents for TF-IDF
    source_tokens = _tokenize(text)
    corpus_token_lists = {doc_id: _tokenize(doc_text) for doc_id, doc_text in corpus_texts.items()}

    # Build IDF from all documents (source + corpus)
    all_doc_tokens = [source_tokens] + list(corpus_token_lists.values())
    idf = _compute_idf(all_doc_tokens)

    # Compute TF-IDF for source
    source_tfidf = _tfidf_vector(source_tokens, idf)

    best_cosine = 0.0
    best_jaccard = 0.0
    best_doc_id = None

    for doc_id, doc_tokens in corpus_token_lists.items():
        doc_tfidf = _tfidf_vector(doc_tokens, idf)

        cosine = _cosine_similarity(source_tfidf, doc_tfidf)
        jaccard = _jaccard_similarity(text, corpus_texts[doc_id])

        if cosine > best_cosine:
            best_cosine = cosine
            best_doc_id = doc_id

        if jaccard > best_jaccard:
            best_jaccard = jaccard
            if best_doc_id is None:
                best_doc_id = doc_id

    # Find sentence-level matches against the best matching document
    matched_segments = []
    if best_doc_id and best_doc_id in corpus_texts:
        matched_segments = _find_matching_segments(text, corpus_texts[best_doc_id])

    return (round(best_cosine, 4), round(best_jaccard, 4), matched_segments)


def determine_verdict(cosine: float, jaccard: float) -> str:
    """
    Determine plagiarism verdict based on similarity scores.
    LIKELY_PLAGIARIZED: cosine >= 0.85 OR jaccard >= 0.60
    POSSIBLY_PLAGIARIZED: cosine >= 0.50 OR jaccard >= 0.35
    ORIGINAL: below thresholds
    """
    if cosine >= 0.85 or jaccard >= 0.60:
        return 'LIKELY_PLAGIARIZED'
    elif cosine >= 0.50 or jaccard >= 0.35:
        return 'POSSIBLY_PLAGIARIZED'
    return 'ORIGINAL'
