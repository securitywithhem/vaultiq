"""
services/text_extractor.py — Extract plain text from PDF and DOCX uploads.
"""

from __future__ import annotations

import io
from typing import Union

import pdfplumber
from docx import Document

from config import MAX_FILE_SIZE_BYTES


def _check_size(data: bytes) -> None:
    """Raise ValueError if the byte payload exceeds the configured limit."""
    if len(data) > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"Document exceeds 10MB size limit "
            f"(received {len(data) / (1024 * 1024):.1f} MB)"
        )


def extract_text_from_pdf(data: bytes) -> str:
    """
    Extract all text from a PDF supplied as raw bytes.

    Args:
        data: Raw PDF file bytes.

    Returns:
        Concatenated plain text from all pages.

    Raises:
        ValueError: If the document is empty or exceeds the size limit.
    """
    _check_size(data)
    try:
        pages: list[str] = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    pages.append(page_text.strip())
        text = "\n\n".join(pages).strip()
        if not text:
            raise ValueError("Document contains no extractable text")
        return text
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Failed to parse PDF: {exc}") from exc


def extract_text_from_docx(data: bytes) -> str:
    """
    Extract all text from a DOCX supplied as raw bytes.

    Includes paragraph text, table cell text, and header/footer runs.

    Args:
        data: Raw DOCX file bytes.

    Returns:
        Concatenated plain text from all parts.

    Raises:
        ValueError: If the document is empty or exceeds the size limit.
    """
    _check_size(data)
    try:
        doc = Document(io.BytesIO(data))
        parts: list[str] = []

        # Regular paragraphs (body, headers, footers)
        for para in doc.paragraphs:
            stripped = para.text.strip()
            if stripped:
                parts.append(stripped)

        # Table cells
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    cell_text = cell.text.strip()
                    if cell_text and cell_text not in parts:
                        parts.append(cell_text)

        # Sections headers / footers
        for section in doc.sections:
            for hdr_ftr in (section.header, section.footer):
                if hdr_ftr is not None:
                    for para in hdr_ftr.paragraphs:
                        stripped = para.text.strip()
                        if stripped and stripped not in parts:
                            parts.append(stripped)

        text = "\n\n".join(parts).strip()
        if not text:
            raise ValueError("Document contains no extractable text")
        return text
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Failed to parse DOCX: {exc}") from exc


def extract_text(filename: str, data: bytes) -> str:
    """
    Dispatch to the correct extractor based on the file extension.

    Args:
        filename: Original filename (used to detect type by extension).
        data:     Raw file bytes.

    Returns:
        Extracted plain text.

    Raises:
        ValueError: On unsupported file type, empty content, or size exceeded.
    """
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return extract_text_from_pdf(data)
    if lower.endswith(".docx"):
        return extract_text_from_docx(data)
    raise ValueError(
        f"Unsupported file type: '{filename}'. Only PDF and DOCX are accepted."
    )
