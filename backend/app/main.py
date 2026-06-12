from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import create_tables, get_db
from app.llm import LLMClient, generate_messages, improve_messages, summarize_messages
from app.models import Document
from app.pdf import markdown_to_pdf
from app.schemas import (
    DocumentCreate,
    DocumentOut,
    DocumentUpdate,
    GenerateRequest,
    MarkdownResponse,
    PdfExportRequest,
    TransformRequest,
)

settings = get_settings()
app = FastAPI(title="Markdown AI Studio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_tables()


def get_llm_client() -> LLMClient:
    return LLMClient(settings)


async def llm_response(messages: list[dict[str, str]], stream: bool, client: LLMClient):
    if stream:
        return StreamingResponse(client.stream(messages), media_type="text/plain; charset=utf-8")

    markdown = await client.complete(messages)
    return MarkdownResponse(markdown=markdown)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/generate", response_model=MarkdownResponse)
async def generate(request: GenerateRequest, client: LLMClient = Depends(get_llm_client)):
    messages = generate_messages(request.prompt, request.content, request.mode)
    return await llm_response(messages, request.stream, client)


@app.post("/api/improve", response_model=MarkdownResponse)
async def improve(request: TransformRequest, client: LLMClient = Depends(get_llm_client)):
    messages = improve_messages(request.content, request.prompt)
    return await llm_response(messages, request.stream, client)


@app.post("/api/summarize", response_model=MarkdownResponse)
async def summarize(request: TransformRequest, client: LLMClient = Depends(get_llm_client)):
    messages = summarize_messages(request.content, request.prompt)
    return await llm_response(messages, request.stream, client)


@app.post("/api/export/pdf")
def export_pdf(request: PdfExportRequest) -> Response:
    pdf_bytes = markdown_to_pdf(request.markdown, request.title)
    filename = request.title.strip().replace(" ", "-") or "markdown-export"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )


@app.get("/api/documents", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)) -> list[Document]:
    statement = select(Document).order_by(Document.updated_at.desc())
    return list(db.scalars(statement).all())


@app.post("/api/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def create_document(payload: DocumentCreate, db: Session = Depends(get_db)) -> Document:
    document = Document(title=payload.title, content=payload.content)
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@app.get("/api/documents/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, db: Session = Depends(get_db)) -> Document:
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return document


@app.put("/api/documents/{document_id}", response_model=DocumentOut)
def update_document(document_id: str, payload: DocumentUpdate, db: Session = Depends(get_db)) -> Document:
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if payload.title is not None:
        document.title = payload.title
    if payload.content is not None:
        document.content = payload.content

    db.commit()
    db.refresh(document)
    return document


@app.delete("/api/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, db: Session = Depends(get_db)) -> Response:
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    db.delete(document)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
