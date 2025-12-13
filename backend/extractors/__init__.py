from backend.extractors.pptx_extractor import extract_text_from_pptx
from backend.extractors.pdf_extractor import extract_text_from_pdf
from backend.extractors.docx_extractor import extract_text_from_docx
from backend.extractors.xlsx_extractor import extract_text_from_xlsx

__all__ = [
    "extract_text_from_pptx",
    "extract_text_from_pdf",
    "extract_text_from_docx",
    "extract_text_from_xlsx",
]
