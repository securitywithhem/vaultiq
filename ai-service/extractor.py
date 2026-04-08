# ─────────────────────────────────────────────────────────────
# VaultIQ — Layer 2: Smart Content Extraction Router
# Updated: 2026-04-08
#
# SYSTEM DEPENDENCIES (must be installed at OS level):
#   sudo apt install tesseract-ocr poppler-utils ffmpeg
#
# pytesseract and whisper will fail gracefully if these
# binaries are missing — extraction continues without them.
# ─────────────────────────────────────────────────────────────

from __future__ import annotations

import os
import subprocess
import tempfile
import logging
from io import BytesIO
from pathlib import Path

logger = logging.getLogger(__name__)


def _extract_text_layer(file_path: str, file_type: str) -> list[dict[str, str]]:
    """Extract standard selectable text from files.
    
    Args:
        file_path: Path to the target file.
        file_type: Extension string (e.g., '.pdf').
        
    Returns:
        List of chunks with 'type': 'text_body' and 'text'.
    """
    chunks = []
    if file_type == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text and text.strip():
                        chunks.append({"type": "text_body", "text": text.strip()})
        except ImportError:
            logger.warning("pdfplumber not installed. Skipping text layer extraction for PDF.")
    elif file_type == ".docx":
        try:
            from docx import Document
            doc = Document(file_path)
            for para in doc.paragraphs:
                if para.text.strip():
                    chunks.append({"type": "text_body", "text": para.text.strip()})
        except ImportError:
            logger.warning("python-docx not installed. Skipping text extraction for DOCX.")
    elif file_type == ".txt":
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                if content.strip():
                    chunks.append({"type": "text_body", "text": content.strip()})
        except UnicodeDecodeError:
            with open(file_path, "r", encoding="latin-1") as f:
                content = f.read()
                if content.strip():
                    chunks.append({"type": "text_body", "text": content.strip()})
    return chunks


def _detect_and_ocr_images(file_path: str, file_type: str) -> list[dict[str, str]]:
    """Find embedded images in the document and run OCR.
    
    Args:
        file_path: Path to the target file.
        file_type: Extension string (e.g., '.pdf', '.docx').
        
    Returns:
        List of chunks with 'type': 'image_ocr' and 'text'.
    """
    chunks = []
    
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        logger.warning("pytesseract or PIL not installed. Skipping image OCR.")
        return chunks

    if file_type == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    for img_obj in page.images:
                        bbox = (img_obj["x0"], img_obj["top"], img_obj["x1"], img_obj["bottom"])
                        cropped = page.within_bbox(bbox).to_image()
                        pil_img = cropped.original
                        
                        try:
                            ocr_text = pytesseract.image_to_string(pil_img)
                            if len(ocr_text.strip()) >= 15:
                                chunks.append({"type": "image_ocr", "text": ocr_text.strip()})
                        except Exception as e:
                            logger.warning(f"Tesseract OCR failed on embedded image: {e}")
        except ImportError:
            pass
            
    elif file_type == ".docx":
        try:
            from docx import Document
            doc = Document(file_path)
            for shape in doc.inline_shapes:
                try:
                    blip = shape._inline.graphic.graphicData.pic.blipFill.blip
                    rId = blip.embed
                    part = doc.part.related_parts[rId]
                    image_bytes = part.blob
                    pil_img = Image.open(BytesIO(image_bytes))
                    
                    try:
                        ocr_text = pytesseract.image_to_string(pil_img)
                        if len(ocr_text.strip()) >= 15:
                            chunks.append({"type": "image_ocr", "text": ocr_text.strip()})
                    except Exception as e:
                        logger.warning(f"Tesseract OCR failed on docx image: {e}")
                except Exception as e:
                    logger.debug(f"Could not extract image from shape: {e}")
        except ImportError:
            pass

    return chunks


def _transcribe_video(file_path: str) -> list[dict[str, str]]:
    """Extract audio from video via ffmpeg and transcribe via whisper.
    
    Args:
        file_path: Path to the video file.
        
    Returns:
        List containing a single dict with 'type': 'video_transcript' and 'text'.
    """
    try:
        import whisper
    except ImportError:
        logger.warning("openai-whisper not installed. Skipping video transcription.")
        return []

    fd, temp_wav = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    
    # Run ffmpeg to extract audio
    cmd = ["ffmpeg", "-i", file_path, "-ar", "16000", "-ac", "1", temp_wav, "-y"]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        logger.warning(f"ffmpeg failed or is not installed: {e}")
        try:
            os.remove(temp_wav)
        except OSError:
            pass
        return []

    # Run whisper
    try:
        model = whisper.load_model("base")
        result = model.transcribe(temp_wav)
        
        try:
            os.remove(temp_wav)
        except OSError:
            pass
            
        return [{"type": "video_transcript", "text": result["text"].strip()}]
    except Exception as e:
        logger.warning(f"Whisper transcription failed: {e}")
        try:
            os.remove(temp_wav)
        except OSError:
            pass
        return []


def _is_scanned_pdf(text_chunks: list[dict[str, str]]) -> bool:
    """Determine if a PDF is likely an image-only scan based on extracted text length.
    
    Args:
        text_chunks: Chunks extracted from the text layer.
        
    Returns:
        True if total combined text is under 80 characters.
    """
    total_length = sum(len(chunk["text"]) for chunk in text_chunks)
    return total_length < 80


def extract_text(file_path: str, file_type: str) -> str:
    """Public entry point for extracting text from a file.
    
    Extracts text chunks using smart logic for text, images, or audio/video.
    Returns a unified string to maintain compatibility with main.py.
    
    Args:
        file_path: Path to the target file.
        file_type: Extension string WITHOUT dot usually as per previous extractor,
                   but logic uses normalized format. We will add the dot if missing.
                   
    Returns:
        A single string containing all extracted text joined together.
    """
    if not file_type.startswith("."):
        file_type = f".{file_type}"
    file_type = file_type.lower()
    
    chunks = []

    if file_type in [".pdf", ".docx", ".txt"]:
        text_chunks = _extract_text_layer(file_path, file_type)

        if file_type == ".pdf" and _is_scanned_pdf(text_chunks):
            # Scanned PDF fallback: full-page OCR using pdf2image + pytesseract
            try:
                from pdf2image import convert_from_path
                import pytesseract
                pages = convert_from_path(file_path)
                for i, page_img in enumerate(pages):
                    try:
                        ocr_text = pytesseract.image_to_string(page_img)
                        if len(ocr_text.strip()) > 15:
                            chunks.append({
                                "type": "image_ocr",
                                "text": ocr_text.strip(),
                                "source": f"scanned_page_{i+1}"
                            })
                    except Exception as e:
                        logger.warning(f"OCR failed on scanned page {i+1}: {e}")
            except ImportError:
                logger.warning("pdf2image or pytesseract not installed. Skipping scanned PDF fallback.")
                chunks.extend(text_chunks)
        else:
            chunks.extend(text_chunks)
            image_chunks = _detect_and_ocr_images(file_path, file_type)
            chunks.extend(image_chunks)

    elif file_type in [".mp4", ".mov", ".avi", ".mkv"]:
        video_chunks = _transcribe_video(file_path)
        chunks.extend(video_chunks)

    else:
        raise ValueError(f"Unsupported file type: {file_type}")

    if not chunks:
        raise ValueError(
            "No extractable content found. File may be empty, "
            "corrupted, or an unsupported format."
        )

    # Tag each chunk with its index for the report
    for i, chunk in enumerate(chunks):
        chunk["chunk_index"] = i
        chunk.setdefault("source", chunk["type"])

    # ─────────────────────────────────────────────────────────────
    # COMPATIBILITY SHIM
    # main.py expects a plain string instead of a list of dicts.
    # Joining all chunk texts into a single string.
    # Note: If the pipeline later supports chunk objects, return `chunks`.
    # ─────────────────────────────────────────────────────────────
    return "\n\n".join(chunk["text"] for chunk in chunks)
