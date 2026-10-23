"""API request/response models (Pydantic v2). These are also the contract the React UI uses."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    conversation_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{8,32}$")

    @field_validator("message")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message is blank")
        return v.strip()


RailType = Literal["input", "output", "generation", "dialog", "retrieval", "other"]


class LLMCall(BaseModel):
    task: str                          # e.g. self_check_input, general, self_check_output
    duration_ms: int
    total_tokens: int | None = None
    prompt: str | None = None          # only when EXPOSE_PROMPTS=true
    completion: str | None = None


class RailStep(BaseModel):
    """One activated rail, in execution order."""
    type: RailType
    name: str                          # the Colang flow name, e.g. "self check input"
    status: Literal["passed", "blocked"]
    duration_ms: int
    decisions: list[str] = []          # what the flow did, e.g. ["execute self_check_input", "refuse to respond"]
    llm_calls: list[LLMCall] = []


class Trace(BaseModel):
    rails: list[RailStep]
    llm_calls: list[LLMCall]
    blocked_by: str | None = None      # "input:self check input", or None if the answer went through
    total_ms: int
    llm_calls_count: int
    total_tokens: int


class ChatResponse(BaseModel):
    conversation_id: str
    turn_id: str
    reply: str
    blocked: bool
    trace: Trace


class TurnRecord(BaseModel):
    turn_id: str
    conversation_id: str
    created_at: datetime
    user_message: str
    reply: str
    blocked: bool
    blocked_by: str | None
    trace: Trace


class Sample(BaseModel):
    id: str
    category: Literal["safe", "off_topic", "medical_advice", "jailbreak", "injection", "emergency", "leak", "privacy"]
    message: str
    expect: Literal["answer", "blocked"]
    expected_rail: str | None = None   # which rail should fire, e.g. "input:check emergency"
    why: str


class EvalResult(BaseModel):
    sample: Sample
    reply: str
    blocked_by: str | None
    passed: bool
