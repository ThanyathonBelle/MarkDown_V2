from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    content: str | None = Field(default=None, max_length=120000)
    mode: Literal["markdown", "readme", "report"] = "markdown"
    stream: bool = True


class TransformRequest(BaseModel):
    content: str = Field(min_length=1, max_length=120000)
    prompt: str | None = Field(default=None, max_length=12000)
    stream: bool = True


class MarkdownResponse(BaseModel):
    markdown: str


class PdfExportRequest(BaseModel):
    markdown: str = Field(min_length=1, max_length=200000)
    title: str = Field(default="markdown-export", max_length=180)


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    content: str = Field(default="", max_length=200000)


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    content: str | None = Field(default=None, max_length=200000)


class DocumentOut(BaseModel):
    id: str
    title: str
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CompanyOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TorDocumentOut(BaseModel):
    id: str
    company_name: str
    file_name: str
    file_type: str
    upload_date: datetime
    document_category: str
    raw_text: str
    extracted_sections: dict
    template_profile_id: str | None

    model_config = {"from_attributes": True}


class TorTemplateProfileOut(BaseModel):
    id: str
    company_name: str
    common_section_order: list
    preferred_section_titles: dict
    writing_style_summary: str
    common_phrases: list
    terminology_preferences: dict
    required_tables: list
    common_deliverable_format: str
    evaluation_style: str
    tone: str
    language: str
    examples_from_uploaded_tor: list
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TorGenerateRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=240)
    project_title: str = Field(min_length=1, max_length=300)
    project_description: str | None = Field(default=None, max_length=20000)
    budget: str | None = Field(default=None, max_length=1000)
    duration: str | None = Field(default=None, max_length=1000)
    requirements: str | None = Field(default=None, max_length=30000)
    language: Literal["th", "en", "th/en"] = "th"


class RetrievedTorExample(BaseModel):
    section_name: str
    file_id: str | None = None
    document_category: str | None = None
    content: str
    score: float


class TorGenerateResponse(BaseModel):
    generated_tor: str
    used_template_profile: dict
    retrieved_examples: list[RetrievedTorExample]
