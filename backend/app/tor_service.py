from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.llm import LLMClient
from app.models import Company, GeneratedTorHistory, TorChunk, TorDocument, TorSection, TorTemplateProfile
from app.tor_parser import extract_sections, parse_tor_file, sections_to_json

logger = logging.getLogger(__name__)

try:
    from qdrant_client import QdrantClient
    from qdrant_client.http.models import Distance, FieldCondition, Filter, MatchValue, PointStruct, VectorParams
except ImportError:  # pragma: no cover - lets the API degrade gracefully if optional deps are not installed yet.
    QdrantClient = None
    Distance = FieldCondition = Filter = MatchValue = PointStruct = VectorParams = None


GENERIC_PLACEHOLDER = "ให้ระบุรายละเอียดตามความเหมาะสมของโครงการ"


async def upload_tor_document(
    *,
    db: Session,
    settings: Settings,
    client: LLMClient,
    company_name: str,
    document_category: str,
    file: UploadFile,
) -> TorDocument:
    clean_company_name = normalize_company_name(company_name)
    if not clean_company_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company name is required.")

    file_name = file.filename or "uploaded-tor"
    suffix = "." + file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if suffix not in {".pdf", ".docx", ".txt", ".md", ".markdown"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload PDF, DOCX, TXT, or Markdown files.")

    max_size = settings.max_upload_size_mb * 1024 * 1024
    data = await file.read(max_size + 1)
    if len(data) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is too large. Maximum upload size is {settings.max_upload_size_mb} MB.",
        )

    try:
        raw_text, file_type = parse_tor_file(file_name, data)
    except Exception as exc:
        logger.exception("Failed to parse TOR upload: %s", file_name)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read the uploaded file.") from exc

    if not raw_text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file did not contain readable text.")

    sections = extract_sections(raw_text)
    company = get_or_create_company(db, clean_company_name)
    document = TorDocument(
        company_id=company.id,
        company_name=company.name,
        file_name=file_name,
        file_type=file_type,
        document_category=document_category.strip() or "TOR",
        raw_text=raw_text,
        extracted_sections=sections_to_json(sections),
    )
    db.add(document)
    db.flush()

    for section in sections:
        db.add(
            TorSection(
                document_id=document.id,
                company_id=company.id,
                section_name=section.name,
                normalized_name=section.normalized_name,
                order_index=section.order_index,
                content=section.content,
                section_data={
                    "title": section.name,
                    "normalized_name": section.normalized_name,
                    "order_index": section.order_index,
                    "content_preview": section.content[:800],
                },
            )
        )

    db.flush()
    profile = rebuild_company_template_profile(db, company)
    document.template_profile_id = profile.id
    chunks = create_tor_chunks(db, document, sections)
    db.flush()

    await index_chunks(settings, client, chunks)
    db.commit()
    db.refresh(document)
    logger.info("Uploaded TOR document %s for company %s", document.id, company.name)
    return document


def get_or_create_company(db: Session, name: str) -> Company:
    existing = db.scalar(select(Company).where(Company.name == name))
    if existing:
        return existing
    company = Company(name=name)
    db.add(company)
    db.flush()
    logger.info("Created TOR company profile namespace: %s", name)
    return company


def rebuild_company_template_profile(db: Session, company: Company) -> TorTemplateProfile:
    sections = list(
        db.scalars(
            select(TorSection)
            .where(TorSection.company_id == company.id)
            .order_by(TorSection.document_id, TorSection.order_index)
        ).all()
    )
    documents = list(
        db.scalars(select(TorDocument).where(TorDocument.company_id == company.id).order_by(TorDocument.upload_date.desc())).all()
    )

    order_positions: dict[str, list[int]] = defaultdict(list)
    preferred_titles: dict[str, Counter[str]] = defaultdict(Counter)
    for section in sections:
        order_positions[section.normalized_name].append(section.order_index)
        preferred_titles[section.normalized_name][section.section_name] += 1

    common_order = [
        name
        for name, _ in sorted(
            order_positions.items(),
            key=lambda item: (sum(item[1]) / max(len(item[1]), 1), -len(item[1])),
        )
    ]
    title_map = {name: counter.most_common(1)[0][0] for name, counter in preferred_titles.items() if counter}
    raw_text = "\n".join(document.raw_text[:12000] for document in documents[:5])

    profile = db.scalar(select(TorTemplateProfile).where(TorTemplateProfile.company_id == company.id))
    if not profile:
        profile = TorTemplateProfile(company_id=company.id, company_name=company.name)
        db.add(profile)
        db.flush()

    profile.company_name = company.name
    profile.common_section_order = common_order
    profile.preferred_section_titles = title_map
    profile.language = detect_language(raw_text)
    profile.tone = "formal procurement"
    profile.writing_style_summary = summarize_style(raw_text, profile.language)
    profile.common_phrases = extract_common_phrases(raw_text)
    profile.terminology_preferences = extract_terminology(raw_text)
    profile.required_tables = detect_required_tables(sections)
    profile.common_deliverable_format = summarize_section_pattern(sections, "deliverables")
    profile.evaluation_style = summarize_section_pattern(sections, "evaluation_criteria")
    profile.examples_from_uploaded_tor = build_profile_examples(documents, sections)
    db.flush()
    logger.info("Rebuilt TOR template profile %s for %s", profile.id, company.name)
    return profile


def create_tor_chunks(db: Session, document: TorDocument, sections: list) -> list[TorChunk]:
    chunks: list[TorChunk] = []
    for section in sections:
        for content in split_chunk_text(section.content):
            vector_id = str(uuid4())
            chunk = TorChunk(
                document_id=document.id,
                company_id=document.company_id,
                company_name=document.company_name,
                file_id=document.id,
                section_name=section.name,
                document_category=document.document_category,
                content=content,
                vector_id=vector_id,
                metadata_json={
                    "company_name": document.company_name,
                    "file_id": document.id,
                    "file_name": document.file_name,
                    "section_name": section.name,
                    "document_category": document.document_category,
                },
            )
            db.add(chunk)
            chunks.append(chunk)
    return chunks


async def index_chunks(settings: Settings, client: LLMClient, chunks: list[TorChunk]) -> None:
    if not chunks or QdrantClient is None:
        return

    texts = [chunk.content for chunk in chunks]
    try:
        embeddings = await client.embed(texts)
        if not embeddings:
            return
        qdrant = QdrantClient(url=settings.vector_db_url)
        ensure_collection(qdrant, settings.vector_collection_name, len(embeddings[0]))
        points = [
            PointStruct(
                id=chunk.vector_id,
                vector=embedding,
                payload={
                    **chunk.metadata_json,
                    "chunk_id": chunk.id,
                    "content": chunk.content[:3000],
                },
            )
            for chunk, embedding in zip(chunks, embeddings, strict=False)
            if chunk.vector_id
        ]
        qdrant.upsert(collection_name=settings.vector_collection_name, points=points)
        logger.info("Indexed %s TOR chunks in Qdrant", len(points))
    except Exception:
        logger.exception("TOR vector indexing failed; upload will remain available without vector search.")


def ensure_collection(qdrant, collection_name: str, vector_size: int) -> None:
    try:
        qdrant.get_collection(collection_name=collection_name)
    except Exception:
        qdrant.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )


async def retrieve_relevant_examples(
    *,
    db: Session,
    settings: Settings,
    client: LLMClient,
    company: Company,
    query: str,
    limit: int = 5,
) -> list[dict]:
    if QdrantClient is not None:
        try:
            embedding = (await client.embed([query]))[0]
            qdrant = QdrantClient(url=settings.vector_db_url)
            results = qdrant.search(
                collection_name=settings.vector_collection_name,
                query_vector=embedding,
                query_filter=Filter(must=[FieldCondition(key="company_name", match=MatchValue(value=company.name))]),
                limit=limit,
            )
            examples = []
            for result in results:
                payload = result.payload or {}
                examples.append(
                    {
                        "section_name": payload.get("section_name", "Example"),
                        "file_id": payload.get("file_id"),
                        "document_category": payload.get("document_category"),
                        "content": payload.get("content", ""),
                        "score": float(result.score),
                    }
                )
            if examples:
                logger.info("Retrieved %s TOR examples from vector search for %s", len(examples), company.name)
                return examples
        except Exception:
            logger.exception("TOR vector retrieval failed; falling back to database keyword retrieval.")

    return fallback_keyword_examples(db, company, query, limit)


def fallback_keyword_examples(db: Session, company: Company, query: str, limit: int) -> list[dict]:
    terms = {term.lower() for term in re.findall(r"[\wก-๙]{3,}", query)}
    chunks = list(db.scalars(select(TorChunk).where(TorChunk.company_id == company.id).limit(200)).all())

    def score(chunk: TorChunk) -> int:
        folded = chunk.content.lower()
        return sum(1 for term in terms if term in folded)

    ranked = sorted(chunks, key=score, reverse=True)[:limit]
    examples = [
        {
            "section_name": chunk.section_name,
            "file_id": chunk.file_id,
            "document_category": chunk.document_category,
            "content": chunk.content[:3000],
            "score": float(score(chunk)),
        }
        for chunk in ranked
        if chunk.content.strip()
    ]
    logger.info("Retrieved %s TOR examples from database fallback for %s", len(examples), company.name)
    return examples


async def generate_tor(
    *,
    db: Session,
    settings: Settings,
    client: LLMClient,
    request,
) -> dict:
    company_name = normalize_company_name(request.company_name)
    company = db.scalar(select(Company).where(Company.name == company_name))
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company template profile was not found.")

    profile = db.scalar(select(TorTemplateProfile).where(TorTemplateProfile.company_id == company.id))
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company template profile was not found.")

    query = "\n".join(
        [
            request.project_title,
            request.project_description or "",
            request.requirements or "",
            request.language or "",
        ]
    )
    examples = await retrieve_relevant_examples(db=db, settings=settings, client=client, company=company, query=query)
    messages = build_tor_generation_messages(request, profile_to_dict(profile), examples)
    generated_tor = await client.complete(messages)

    history = GeneratedTorHistory(
        company_id=company.id,
        company_name=company.name,
        project_title=request.project_title,
        request_payload=request.model_dump(),
        generated_tor=generated_tor,
        used_template_profile=profile_to_dict(profile),
        retrieved_examples=examples,
    )
    db.add(history)
    db.commit()
    logger.info("Generated TOR history %s for %s", history.id, company.name)
    return {
        "generated_tor": generated_tor,
        "used_template_profile": profile_to_dict(profile),
        "retrieved_examples": examples,
    }


def build_tor_generation_messages(request, profile: dict, examples: list[dict]) -> list[dict[str, str]]:
    example_text = "\n\n".join(
        f"Example section: {example['section_name']}\n{example['content'][:1800]}" for example in examples
    )
    profile_text = format_profile_for_prompt(profile)
    project_details = f"""
Project title: {request.project_title}
Project description: {request.project_description or GENERIC_PLACEHOLDER}
Budget: {request.budget or GENERIC_PLACEHOLDER}
Duration: {request.duration or GENERIC_PLACEHOLDER}
Requirements: {request.requirements or GENERIC_PLACEHOLDER}
Language: {request.language or profile.get("language") or "th"}
""".strip()

    system = (
        "You are an expert TOR procurement writer. Return a complete TOR in clean Markdown only. "
        "Follow the selected company's TOR structure, section order, formal wording, terminology, tone, and table patterns. "
        "Do not copy full sentences from previous TOR files unless they are generic legal or procurement phrases. "
        "If project details are missing, create reasonable placeholders instead of failing."
    )
    user = f"""
Company template profile:
{profile_text}

Retrieved TOR examples from the same company:
{example_text or "No examples retrieved. Use the template profile."}

New project details:
{project_details}

Generate a complete TOR for the new project.
""".strip()
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def profile_to_dict(profile: TorTemplateProfile) -> dict:
    return {
        "id": profile.id,
        "company_name": profile.company_name,
        "common_section_order": profile.common_section_order,
        "preferred_section_titles": profile.preferred_section_titles,
        "writing_style_summary": profile.writing_style_summary,
        "common_phrases": profile.common_phrases,
        "terminology_preferences": profile.terminology_preferences,
        "required_tables": profile.required_tables,
        "common_deliverable_format": profile.common_deliverable_format,
        "evaluation_style": profile.evaluation_style,
        "tone": profile.tone,
        "language": profile.language,
        "examples_from_uploaded_tor": profile.examples_from_uploaded_tor,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }


def format_profile_for_prompt(profile: dict) -> str:
    lines = [
        f"company_name: {profile.get('company_name')}",
        f"language: {profile.get('language')}",
        f"tone: {profile.get('tone')}",
        f"common_section_order: {profile.get('common_section_order')}",
        f"preferred_section_titles: {profile.get('preferred_section_titles')}",
        f"writing_style_summary: {profile.get('writing_style_summary')}",
        f"common_phrases: {profile.get('common_phrases')}",
        f"terminology_preferences: {profile.get('terminology_preferences')}",
        f"required_tables: {profile.get('required_tables')}",
        f"common_deliverable_format: {profile.get('common_deliverable_format')}",
        f"evaluation_style: {profile.get('evaluation_style')}",
    ]
    return "\n".join(lines)


def split_chunk_text(text: str, max_chars: int = 1400, overlap: int = 180) -> list[str]:
    cleaned = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not cleaned:
        return []
    if len(cleaned) <= max_chars:
        return [cleaned]

    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(start + max_chars, len(cleaned))
        boundary = cleaned.rfind("\n\n", start, end)
        if boundary > start + 300:
            end = boundary
        chunks.append(cleaned[start:end].strip())
        if end == len(cleaned):
            break
        start = max(0, end - overlap)
    return [chunk for chunk in chunks if chunk]


def normalize_company_name(name: str) -> str:
    return re.sub(r"\s+", " ", name or "").strip()


def detect_language(text: str) -> str:
    thai_chars = len(re.findall(r"[ก-๙]", text))
    latin_chars = len(re.findall(r"[A-Za-z]", text))
    if thai_chars and latin_chars:
        return "th/en"
    if thai_chars:
        return "th"
    return "en"


def summarize_style(text: str, language: str) -> str:
    has_numbering = bool(re.search(r"^\s*\d+(\.\d+)*\s+", text, re.MULTILINE))
    has_tables = "|" in text or "\t" in text
    traits = ["formal procurement language", "structured section headings"]
    if has_numbering:
        traits.append("numbered clauses")
    if has_tables:
        traits.append("table-based requirements or scoring")
    if language.startswith("th"):
        traits.append("Thai official/business wording")
    return ", ".join(traits) + "."


def extract_common_phrases(text: str) -> list[str]:
    candidates = []
    for line in text.splitlines():
        cleaned = re.sub(r"\s+", " ", line).strip()
        if 20 <= len(cleaned) <= 160 and any(keyword in cleaned.lower() for keyword in ["shall", "must", "ต้อง", "ผู้เสนอราคา", "ส่งมอบ"]):
            candidates.append(cleaned)
    return [phrase for phrase, _ in Counter(candidates).most_common(12)]


def extract_terminology(text: str) -> dict:
    terms = ["TOR", "SLA", "UAT", "API", "AI", "LLM", "ผู้เสนอราคา", "ผู้ว่าจ้าง", "ผู้รับจ้าง", "คณะกรรมการ"]
    found = [term for term in terms if term.lower() in text.lower()]
    return {"preferred_terms": found}


def detect_required_tables(sections: list[TorSection]) -> list[str]:
    table_sections = []
    for section in sections:
        if "|" in section.content or "\t" in section.content:
            table_sections.append(section.name)
    return list(dict.fromkeys(table_sections))[:10]


def summarize_section_pattern(sections: list[TorSection], normalized_name: str) -> str:
    matching = [section.content for section in sections if section.normalized_name == normalized_name]
    if not matching:
        return ""
    sample = matching[0]
    if "|" in sample:
        return "Often expressed as a table with item, description, due date, and acceptance details."
    if re.search(r"^\s*[-*]\s+", sample, re.MULTILINE):
        return "Often expressed as bullet points."
    if re.search(r"^\s*\d+[\.)]\s+", sample, re.MULTILINE):
        return "Often expressed as numbered requirements."
    return sample[:500]


def build_profile_examples(documents: list[TorDocument], sections: list[TorSection]) -> list[dict]:
    examples = []
    for section in sections[:8]:
        examples.append(
            {
                "file_id": section.document_id,
                "section_name": section.section_name,
                "content_preview": section.content[:800],
            }
        )
    if not examples:
        examples = [{"file_id": document.id, "section_name": "Full TOR", "content_preview": document.raw_text[:800]} for document in documents[:3]]
    return examples
