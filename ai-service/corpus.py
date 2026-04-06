"""
corpus.py — Thread-safe in-memory corpus store
Stores document texts for plagiarism comparison across uploads.
"""

import threading
from typing import Dict, Optional


class CorpusStore:
    """
    Thread-safe in-memory corpus store for document texts.
    Documents are stored as {doc_id: text} pairs.
    Uses threading.Lock to ensure safe concurrent access.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._documents: Dict[str, str] = {}

    def add(self, doc_id: str, text: str) -> None:
        """Add a document to the corpus."""
        with self._lock:
            self._documents[doc_id] = text

    def get(self, doc_id: str) -> Optional[str]:
        """Get a document by ID. Returns None if not found."""
        with self._lock:
            return self._documents.get(doc_id)

    def get_all(self) -> Dict[str, str]:
        """Get all documents in the corpus (returns a copy)."""
        with self._lock:
            return dict(self._documents)

    def get_all_except(self, exclude_id: str) -> Dict[str, str]:
        """Get all documents except the one with the given ID."""
        with self._lock:
            return {k: v for k, v in self._documents.items() if k != exclude_id}

    def remove(self, doc_id: str) -> bool:
        """Remove a document from the corpus. Returns True if it existed."""
        with self._lock:
            if doc_id in self._documents:
                del self._documents[doc_id]
                return True
            return False

    def size(self) -> int:
        """Return the number of documents in the corpus."""
        with self._lock:
            return len(self._documents)

    def clear(self) -> None:
        """Clear all documents from the corpus."""
        with self._lock:
            self._documents.clear()


# Singleton instance used across the application
corpus_store = CorpusStore()
