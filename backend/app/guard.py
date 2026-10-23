"""Thin wrapper around NeMo Guardrails' LLMRails.

What NeMo does for us (compare with Project 1, where we wrote all of this):
  - runs the input rails listed in config.yml, in order
  - calls the main LLM with the "general" instructions + chat history
  - runs the output rails
  - replaces the answer with a canned "bot ..." message when a rail stops

What this file adds:
  - asks NeMo for its generation log (which rails ran, which LLM calls happened)
  - converts that log into a small, UI-friendly Trace

Docs:
  Python API      https://docs.nvidia.com/nemo/guardrails/run-guardrailed-inference/using-python-apis/core-classes
  Generation log  https://docs.nvidia.com/nemo/guardrails/run-guardrailed-inference/using-python-apis/generation-options
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from nemoguardrails import LLMRails, RailsConfig

from .schemas import LLMCall, RailStep, Trace

_KNOWN_TYPES = {"input", "output", "generation", "dialog", "retrieval"}


class ClinicGuard:
    def __init__(self, config_path: Path, llm: Any | None = None, expose_prompts: bool = True):
        # RailsConfig.from_path reads config.yml, prompts.yml and every .co file in the folder.
        self.config = RailsConfig.from_path(str(config_path))
        # LLMRails is created ONCE and reused for every request (it compiles the flows at startup).
        # `llm` lets tests inject nemoguardrails.testing.FakeLLMModel instead of OpenAI.
        self.rails = LLMRails(self.config, llm=llm)
        self.expose_prompts = expose_prompts

    async def respond(self, messages: list[dict]) -> tuple[str, Trace]:
        """messages = OpenAI-style history ending with the new user message."""
        started = time.perf_counter()
        result = await self.rails.generate_async(
            messages=messages,
            # Asking for a log turns the return value into a GenerationResponse.
            options={"log": {"activated_rails": True, "llm_calls": True}},
        )
        reply = result.response[0]["content"] if result.response else ""
        trace = self._to_trace(result.log, int((time.perf_counter() - started) * 1000))
        return reply, trace

    def _call(self, c) -> LLMCall:
        return LLMCall(
            task=c.task or "unknown",
            duration_ms=int((c.duration or 0) * 1000),
            total_tokens=c.total_tokens,
            prompt=c.prompt if self.expose_prompts else None,
            completion=c.completion if self.expose_prompts else None,
        )

    def _to_trace(self, log, total_ms: int) -> Trace:
        rails: list[RailStep] = []
        blocked_by = None
        for r in log.activated_rails:
            # A rail with stop=True ended the conversation turn: that's the rail that blocked.
            # (Generation rails never "block"; they just produce the draft answer.)
            stopped = bool(r.stop) and r.type in {"input", "output", "dialog", "retrieval"}
            if stopped and blocked_by is None:
                blocked_by = f"{r.type}:{r.name}"
            calls = [self._call(c) for a in r.executed_actions for c in (a.llm_calls or [])]
            rails.append(RailStep(
                type=r.type if r.type in _KNOWN_TYPES else "other",
                name=r.name,
                status="blocked" if stopped else "passed",
                duration_ms=int((r.duration or 0) * 1000),
                # Hide NeMo's internal bookkeeping actions to keep the trace readable.
                decisions=[d for d in r.decisions if d not in {"execute retrieve_relevant_chunks",
                                                               "execute generate_bot_message"}],
                llm_calls=calls,
            ))
        llm_calls = [self._call(c) for c in (log.llm_calls or [])]
        return Trace(
            rails=rails,
            llm_calls=llm_calls,
            blocked_by=blocked_by,
            total_ms=total_ms,
            llm_calls_count=len(llm_calls),
            total_tokens=sum(c.total_tokens or 0 for c in llm_calls),
        )
