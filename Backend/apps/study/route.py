import json
import os
import re
import urllib.error
import urllib.request
from collections import Counter
from io import BytesIO
from pathlib import PurePath
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()

router = APIRouter()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_DOCUMENT_CHARS = 300_000
MAX_DOCUMENT_PAGES = 100
MAX_CONTEXT_PAGES = 6
MAX_CONTEXT_PAGE_CHARS = 3_500
STOP_WORDS = {
    "about", "after", "again", "also", "and", "are", "because", "been",
    "before", "being", "between", "but", "can", "could", "does", "during",
    "each", "explain", "for", "from", "have", "has", "into", "its", "more",
    "most", "other", "should", "that", "the", "their", "there", "these",
    "this", "through", "was", "were", "what", "when", "where", "which",
    "while", "with", "would", "your",
}


class StudyPage(BaseModel):
    page: int = Field(ge=1)
    content: str


class StudyDocument(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    pages: list[StudyPage] = Field(min_length=1, max_length=MAX_DOCUMENT_PAGES)


class StudyRequest(BaseModel):
    course: str = Field(min_length=1, max_length=160)
    question: str = Field(min_length=1, max_length=2000)
    documents: list[StudyDocument] = Field(min_length=1, max_length=30)


class ExplainRequest(StudyRequest):
    pass


def _check_document_size(documents: list[StudyDocument]) -> None:
    total_chars = sum(len(page.content) for doc in documents for page in doc.pages)
    if total_chars > MAX_DOCUMENT_CHARS:
        raise HTTPException(
            status_code=413,
            detail="This study session exceeds the 300,000-character limit. Remove or shorten some documents.",
        )
    if not any(page.content.strip() for doc in documents for page in doc.pages):
        raise HTTPException(
            status_code=422,
            detail="No readable text is available in these documents. Paste searchable text or upload a searchable PDF.",
        )


def _tokens(text: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-zA-Z0-9]+", text.lower())
        if len(token) > 2 and token not in STOP_WORDS
    ]


def select_relevant_pages(
    documents: list[StudyDocument], query: str, limit: int = MAX_CONTEXT_PAGES
) -> list[tuple[StudyDocument, StudyPage]]:
    query_terms = set(_tokens(query))
    candidates: list[tuple[int, int, StudyDocument, StudyPage]] = []

    for doc_index, document in enumerate(documents):
        for page in document.pages:
            page_terms = _tokens(page.content)
            term_counts = Counter(page_terms)
            overlap = sum(term_counts[term] for term in query_terms)
            candidates.append((overlap, -doc_index, document, page))

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    matching = [item for item in candidates if item[0] > 0][:limit]
    chosen = matching or candidates[:limit]
    return [(document, page) for _, _, document, page in chosen]


def _context(
    documents: list[StudyDocument], query: str
) -> tuple[str, list[dict[str, Any]]]:
    selected_pages = select_relevant_pages(documents, query)
    context_parts: list[str] = []
    citations: list[dict[str, Any]] = []

    for document, page in selected_pages:
        citation = {"document": document.name, "page": page.page}
        citations.append(citation)
        context_parts.append(
            f"[Source: {document.name}, page {page.page}]\n"
            f"{page.content[:MAX_CONTEXT_PAGE_CHARS]}"
        )

    return "\n\n---\n\n".join(context_parts), citations


def _generate(prompt: str, *, json_output: bool = False) -> str:
    payload: dict[str, Any] = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2, "num_ctx": 8192},
    }
    if json_output:
        payload["format"] = "json"

    request = urllib.request.Request(
        f"{OLLAMA_URL.rstrip('/')}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        if error.code == 404:
            raise HTTPException(
                status_code=503,
                detail=f"The local model {OLLAMA_MODEL!r} is not installed. Run `ollama pull {OLLAMA_MODEL}` once while online.",
            ) from error
        raise HTTPException(
            status_code=502,
            detail=f"The local AI service returned HTTP {error.code}: {detail[:300]}",
        ) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise HTTPException(
            status_code=503,
            detail="The local AI model is unavailable. Start Ollama and ensure the configured model is installed.",
        ) from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(
            status_code=502, detail="The local AI service returned an invalid response."
        ) from error

    answer = result.get("response")
    if not isinstance(answer, str) or not answer.strip():
        raise HTTPException(
            status_code=502, detail="The local AI model returned an empty response."
        )
    return answer.strip()


@router.get("/status")
def status() -> dict[str, Any]:
    request = urllib.request.Request(f"{OLLAMA_URL.rstrip('/')}/api/tags")
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            data = json.loads(response.read().decode("utf-8"))
        models = [item.get("name", "") for item in data.get("models", [])]
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return {
            "available": False,
            "running": False,
            "model": OLLAMA_MODEL,
            "message": "Ollama is not running. Start the local Ollama app to enable AI tools.",
        }

    installed = OLLAMA_MODEL in models
    return {
        "available": installed,
        "running": True,
        "model": OLLAMA_MODEL,
        "message": (
            "Local AI ready."
            if installed
            else f"Install the model with `ollama pull {OLLAMA_MODEL}`."
        ),
    }


@router.post("/documents/pdf")
async def extract_pdf(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = PurePath(file.filename or "notes.pdf").name
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Upload a PDF file.")

    content = await file.read(MAX_PDF_BYTES + 1)
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=413, detail="PDFs must be smaller than 20 MB."
        )
    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF.")

    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted:
            raise HTTPException(
                status_code=400,
                detail="This PDF is password-protected. Export an unlocked copy and try again.",
            )
        if len(reader.pages) > MAX_DOCUMENT_PAGES:
            raise HTTPException(
                status_code=413,
                detail=f"PDFs are limited to {MAX_DOCUMENT_PAGES} pages.",
            )
        pages = [
            {"page": number, "content": (page.extract_text() or "").strip()}
            for number, page in enumerate(reader.pages, start=1)
        ]
    except HTTPException:
        raise
    except ImportError as error:
        raise HTTPException(
            status_code=503,
            detail="PDF support is not installed. Run `python -m pip install -r requirements.txt` in calc-be-main.",
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail="Could not read this PDF. It may be damaged or image-only; use a searchable PDF or paste its text.",
        ) from error

    text_size = sum(len(page["content"]) for page in pages)
    if text_size == 0:
        raise HTTPException(
            status_code=422,
            detail="No selectable text was found. This may be a scanned PDF; paste text or OCR it first.",
        )
    return {"name": filename, "pages": pages}


@router.post("/ask")
def ask(request: StudyRequest) -> dict[str, Any]:
    _check_document_size(request.documents)
    context, citations = _context(request.documents, request.question)
    prompt = f"""You are a careful STEM tutor for a student studying {request.course}.
Answer the student's question using the supplied course materials as your primary source.
Explain difficult ideas in clear steps, define notation, and use a small worked example when useful.
Do not invent facts or citations. If the materials do not contain enough information, say what is missing and distinguish any general background knowledge from the notes.
When using a supplied passage, cite it inline exactly as [Source: filename, page N].

COURSE MATERIALS:
{context}

STUDENT QUESTION:
{request.question}

Give a direct, structured answer suitable for revision."""
    answer = _generate(prompt)
    return {"answer": answer, "citations": citations, "model": OLLAMA_MODEL}


@router.post("/mind-map")
def mind_map(request: StudyRequest) -> dict[str, Any]:
    _check_document_size(request.documents)
    context, citations = _context(request.documents, request.question)
    prompt = f"""Create a concise, accurate STEM mind map for {request.course}, grounded in the supplied materials and focused on: {request.question}.
Return JSON only with this exact shape:
{{"title":"short topic title","nodes":[{{"id":"root","label":"short label","detail":"one-sentence explanation"}}],"edges":[{{"source":"root","target":"node-2","label":"optional relationship"}}]}}
Create 4 to 8 nodes, use unique simple ids, include a root node, and only connect ids that exist. Keep labels short enough for a diagram. Do not add facts not supported by the materials.

COURSE MATERIALS:
{context}"""
    try:
        result = json.loads(_generate(prompt, json_output=True))
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=502, detail="The local model did not return a valid mind map."
        ) from error

    nodes = result.get("nodes")
    if not isinstance(nodes, list) or not 2 <= len(nodes) <= 8:
        raise HTTPException(
            status_code=502, detail="The local model returned an invalid mind map."
        )
    clean_nodes = []
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id", f"node-{index + 1}"))[:40]
        label = str(node.get("label", "")).strip()[:80]
        if label:
            clean_nodes.append(
                {
                    "id": node_id,
                    "label": label,
                    "detail": str(node.get("detail", "")).strip()[:300],
                }
            )
    node_ids = {node["id"] for node in clean_nodes}
    raw_edges = result.get("edges")
    if not isinstance(raw_edges, list):
        raw_edges = []
    edges = [
        {
            "source": edge["source"],
            "target": edge["target"],
            "label": str(edge.get("label", "")).strip()[:60],
        }
        for edge in raw_edges
        if isinstance(edge, dict)
        and edge.get("source") in node_ids
        and edge.get("target") in node_ids
        and edge.get("source") != edge.get("target")
    ]
    if len(clean_nodes) < 2:
        raise HTTPException(
            status_code=502, detail="The local model returned an empty mind map."
        )
    return {
        "title": str(result.get("title", request.question)).strip()[:100],
        "nodes": clean_nodes,
        "edges": edges,
        "citations": citations,
        "model": OLLAMA_MODEL,
    }


@router.post("/explain")
def explain(request: ExplainRequest) -> dict[str, Any]:
    _check_document_size(request.documents)
    context, citations = _context(request.documents, request.question)
    prompt = f"""Teach {request.course} student this topic from their course materials: {request.question}.
Return JSON only with this exact shape:
{{"title":"topic title","steps":[{{"title":"short step title","explanation":"one or two clear sentences","visual":"a short visual analogy or diagram cue"}}]}}
Give 3 to 5 ordered steps that build from intuition to a precise STEM explanation. Each visual cue must be safe and possible to depict with simple shapes/text. Do not add unsupported claims.

COURSE MATERIALS:
{context}"""
    try:
        result = json.loads(_generate(prompt, json_output=True))
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=502, detail="The local model did not return a valid explanation."
        ) from error

    steps = result.get("steps")
    if not isinstance(steps, list) or not 3 <= len(steps) <= 5:
        raise HTTPException(
            status_code=502, detail="The local model returned an invalid explanation."
        )
    clean_steps = [
        {
            "title": str(step.get("title", "")).strip()[:100],
            "explanation": str(step.get("explanation", "")).strip()[:600],
            "visual": str(step.get("visual", "")).strip()[:200],
        }
        for step in steps
        if isinstance(step, dict) and step.get("title") and step.get("explanation")
    ]
    if len(clean_steps) < 3:
        raise HTTPException(
            status_code=502, detail="The local model returned incomplete explanation steps."
        )
    return {
        "title": str(result.get("title", request.question)).strip()[:100],
        "steps": clean_steps,
        "citations": citations,
        "model": OLLAMA_MODEL,
    }
