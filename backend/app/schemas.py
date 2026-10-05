from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .diary import DiaryContext
from .lab_analysis import LabContext


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=3000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=2000)
    history: list[Message] = Field(default_factory=list, max_length=6)
    diary: DiaryContext | None = None
    diary_consent: bool = False
    labs: LabContext | None = None
    labs_consent: bool = False

    @model_validator(mode="after")
    def require_consent(self):
        if self.diary is not None and not self.diary_consent:
            raise ValueError("Diary access requires explicit consent")
        if self.labs is not None and not self.labs_consent:
            raise ValueError("Lab access requires explicit consent")
        if self.labs and self.diary and self.labs.as_of != self.diary.as_of:
            raise ValueError("Diary and lab dates must agree")
        return self

    @field_validator("message")
    @classmethod
    def nonblank_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message must not be blank")
        return value


class Source(BaseModel):
    id: str
    title: str
    url: str
    publisher: str
    checked_at: str
    language: Literal["ru", "en"] = "ru"


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source] = Field(default_factory=list)
    mode: Literal["llm", "reference", "safety", "no_evidence"]
    retrieval: Literal["lexical", "hybrid", "none"] = "none"
    notice: str | None = None
    usage: Usage | None = None
    diary_used: bool = False
    labs_used: bool = False


class GroundedAnswer(BaseModel):
    """The model selects source IDs; URLs always come from our reviewed corpus."""

    model_config = ConfigDict(extra="forbid")
    answer: str = Field(min_length=20, max_length=2500)
    source_ids: list[str] = Field(min_length=1, max_length=6)
