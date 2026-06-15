from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(240), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    tor_documents: Mapped[list["TorDocument"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    template_profile: Mapped["TorTemplateProfile | None"] = relationship(
        back_populates="company",
        cascade="all, delete-orphan",
        uselist=False,
    )


class TorDocument(Base):
    __tablename__ = "tor_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(24), nullable=False)
    upload_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
    document_category: Mapped[str] = mapped_column(String(120), nullable=False, default="TOR", index=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    extracted_sections: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    template_profile_id: Mapped[str | None] = mapped_column(
        ForeignKey("tor_template_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    company: Mapped[Company] = relationship(back_populates="tor_documents")
    sections: Mapped[list["TorSection"]] = relationship(back_populates="document", cascade="all, delete-orphan")
    chunks: Mapped[list["TorChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class TorSection(Base):
    __tablename__ = "tor_sections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    document_id: Mapped[str] = mapped_column(ForeignKey("tor_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    section_name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    normalized_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    section_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    document: Mapped[TorDocument] = relationship(back_populates="sections")


class TorTemplateProfile(Base):
    __tablename__ = "tor_template_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, unique=True)
    company_name: Mapped[str] = mapped_column(String(240), nullable=False, unique=True, index=True)
    common_section_order: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    preferred_section_titles: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    writing_style_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    common_phrases: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    terminology_preferences: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    required_tables: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    common_deliverable_format: Mapped[str] = mapped_column(Text, nullable=False, default="")
    evaluation_style: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tone: Mapped[str] = mapped_column(String(120), nullable=False, default="formal")
    language: Mapped[str] = mapped_column(String(40), nullable=False, default="mixed")
    examples_from_uploaded_tor: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    company: Mapped[Company] = relationship(back_populates="template_profile")


class TorChunk(Base):
    __tablename__ = "tor_chunks"
    __table_args__ = (UniqueConstraint("vector_id", name="uq_tor_chunks_vector_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    document_id: Mapped[str] = mapped_column(ForeignKey("tor_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    file_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    section_name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    document_category: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    vector_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    document: Mapped[TorDocument] = relationship(back_populates="chunks")


class GeneratedTorHistory(Base):
    __tablename__ = "generated_tor_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    project_title: Mapped[str] = mapped_column(String(300), nullable=False)
    request_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    generated_tor: Mapped[str] = mapped_column(Text, nullable=False)
    used_template_profile: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    retrieved_examples: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
