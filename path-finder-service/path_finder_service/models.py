from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class ParserManifest(BaseModel):
    id: str = Field(alias="_id", default="")
    job_id: str = ""
    status: JobStatus = JobStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: datetime | None = None
    error: str | None = None
    url_pattern: dict[str, str] | None = None
    parser: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}


class FeedRequest(BaseModel):
    url: str
    html: str
    job_id: str


class ForceRequest(BaseModel):
    job_id: str


class RegenerationRequest(BaseModel):
    parser_id: str
    labels: list[str] | None = None
    force: bool = False


class PipelineConfig(BaseModel):
    ai_endpoint: str = "https://api.anthropic.com/v1/messages"
    ai_model: str = "claude-sonnet-4-20250514"
    max_direct_kb: int = 300
    top_n_nodes: int = 30
    max_sentences: int = 3
    max_sentence_chars: int = 500
    similarity_threshold: float = 0.75
    max_retries: int = 3
    output_format: str = "json"
    exclusions: list[str] = Field(default_factory=list)
    min_pages: int = 2
