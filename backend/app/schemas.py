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
