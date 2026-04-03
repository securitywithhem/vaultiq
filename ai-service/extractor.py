import io
import PyPDF2
from docx import Document
from typing import Optional

def extract_text(file_bytes: bytes, filename: str) -> Optional[str]:
    """
    Extracts plain text from various file formats (.txt, .pdf, .docx).
    Returns None if format is unsupported or extraction fails.
    """
    ext = filename.lower().split('.')[-1]
    
    try:
        if ext == 'txt':
            return file_bytes.decode('utf-8')
        
        elif ext == 'pdf':
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            text = ""
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return text.strip() if text else None
            
        elif ext == 'docx':
            doc = Document(io.BytesIO(file_bytes))
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return text.strip() if text else None
            
        return None
    except Exception as e:
        print(f"[extract_text] Error processing {filename}: {str(e)}")
        return None
