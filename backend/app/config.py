from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(default="postgresql://postgres:postgres@localhost:5432/markdown_ai", alias="DATABASE_URL")
    llm_base_url: str = Field(
        default="http://h200-server:8000/v1",
        validation_alias=AliasChoices("OPENAI_API_BASE", "LLM_BASE_URL"),
    )
    llm_api_key: str | None = Field(default=None, validation_alias=AliasChoices("OPENAI_API_KEY", "LLM_API_KEY"))
    llm_model: str = Field(default="your-model-name", validation_alias=AliasChoices("MODEL_NAME", "LLM_MODEL"))
    embedding_model: str = Field(default="BAAI/bge-m3", alias="EMBEDDING_MODEL")
    vector_db_url: str = Field(default="http://qdrant:6333", alias="VECTOR_DB_URL")
    vector_collection_name: str = Field(default="tor_chunks", alias="VECTOR_COLLECTION_NAME")
    max_upload_size_mb: int = Field(default=25, alias="MAX_UPLOAD_SIZE_MB")
    cors_origins: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")
    request_timeout_seconds: float = Field(default=120.0, alias="REQUEST_TIMEOUT_SECONDS")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
