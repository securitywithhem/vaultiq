import pytest
import os
import tempfile
from unittest.mock import patch, MagicMock

import extractor


def test_internal_extraction_structure():
    """test_1: Call extractor logic with a plain .txt file.
    
    Validates that the underlying chunks output before the compatibility
    shim matches the specification:
    list with a dict containing "type" == "text_body"
    """
    text_content = "This is a human written paragraph for testing purposes."
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as tmp:
        tmp.write(text_content)
        tmp_path = tmp.name

    try:
        # Test the raw extracted layer to verify the list of dicts structure:
        # "returns a list, first item has key 'type' == 'text_body'"
        chunks = extractor._extract_text_layer(tmp_path, ".txt")
        assert isinstance(chunks, list)
        assert len(chunks) == 1
        assert chunks[0]["type"] == "text_body"
        
        # Test the public entry point with the main.py shim
        shimmed_result = extractor.extract_text(tmp_path, "txt")
        assert text_content in shimmed_result
    finally:
        os.remove(tmp_path)


@patch("sys.modules", {"pytesseract": MagicMock(), "whisper": MagicMock()})
def test_unsupported_file_type():
    """test_2: Call extract_text() with an unsupported file type '.xyz'
    Assert: raises ValueError
    """
    with pytest.raises(ValueError, match="Unsupported file type"):
        extractor.extract_text("dummy.xyz", "xyz")


def test_is_scanned_pdf():
    """test_3: Call _is_scanned_pdf() with an empty chunk list []
    Assert: returns True
    """
    result = extractor._is_scanned_pdf([])
    assert result is True
