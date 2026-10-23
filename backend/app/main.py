"""FastAPI app.

  POST /api/chat                   send a message, get the reply + rail trace
  GET  /api/conversations/{id}     full conversation with traces
  GET  /api/logs?limit=50          recent turns (audit log)
  GET  /api/stats                  how often each rail blocked
  GET  /api/config                 the NeMo config files (read-only, for the UI)
  GET  /api/samples                attack lab prompts
  POST /api/eval                   run all samples, report pass/fail
  GET  /api/health

Run:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .guard import ClinicGuard
from .samples import SAMPLES
from .schemas import ChatRequest, ChatResponse, EvalResult, Sample, TurnRecord
from .settings import Settings
from .store import Store

CONFIG_FILES = ["config.yml", "prompts.yml", "rails/messages.co", "rails/input.co", "rails/output.co"]


def create_app(settings: Settings | None = None, store: Store | None = None,
               guard_factory: Callable[[], ClinicGuard] | None = None) -> FastAPI:
    """Factory so tests can inject mongomock and a fake LLM."""
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if guard_factory is None and not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.")
        app.state.store = store or Store.connect(settings.mongo_uri, settings.mongo_db)
        app.state.guard = (guard_factory or (lambda: ClinicGuard(settings.config_path,
                                                                 expose_prompts=settings.expose_prompts)))()
        yield

    app = FastAPI(title="ClinicDesk (NeMo Guardrails)", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    async def run_turn(message: str, conversation_id: str | None) -> ChatResponse:
        st: Store = app.state.store
        guard: ClinicGuard = app.state.guard
        conversation_id = conversation_id or st.new_id()
        history = st.history(conversation_id, settings.max_history_turns)
        reply, trace = await guard.respond(history + [{"role": "user", "content": message}])
        record = st.save(conversation_id, message, reply, trace)
        return ChatResponse(conversation_id=conversation_id, turn_id=record.turn_id,
                            reply=reply, blocked=record.blocked, trace=trace)

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        guard: ClinicGuard = app.state.guard
        main = next((m for m in guard.config.models if m.type == "main"), None)
        return {"status": "ok", "model": main.model if main else "injected",
                "input_rails": guard.config.rails.input.flows,
                "output_rails": guard.config.rails.output.flows,
                "expose_prompts": settings.expose_prompts}

    @app.post("/api/chat", response_model=ChatResponse)
    async def chat(req: ChatRequest) -> ChatResponse:
        try:
            return await run_turn(req.message, req.conversation_id)
        except Exception as exc:  # e.g. OpenAI auth error, network error
            # Fail closed with a generic message; details stay in server logs.
            raise HTTPException(status_code=502, detail=f"Guardrails/LLM error: {type(exc).__name__}") from exc

    @app.get("/api/conversations/{conversation_id}", response_model=list[TurnRecord])
    def conversation(conversation_id: str) -> list[TurnRecord]:
        return app.state.store.conversation(conversation_id)

    @app.get("/api/logs", response_model=list[TurnRecord])
    def logs(limit: int = Query(default=50, ge=1, le=200)) -> list[TurnRecord]:
        return app.state.store.recent(limit)

    @app.get("/api/stats")
    def stats() -> dict:
        return app.state.store.stats()

    @app.get("/api/config")
    def config_files() -> dict[str, str]:
        # A fixed allowlist of files: never build paths from user input.
        base = settings.config_path
        return {name: (base / name).read_text(encoding="utf-8") for name in CONFIG_FILES if (base / name).exists()}

    @app.get("/api/samples", response_model=list[Sample])
    def samples() -> list[Sample]:
        return SAMPLES

    @app.post("/api/eval", response_model=list[EvalResult])
    async def evaluate() -> list[EvalResult]:
        """Runs every sample in a fresh conversation. Costs real tokens (~3 LLM calls per safe sample)."""
        sem = asyncio.Semaphore(4)                       # be gentle with rate limits

        async def one(s: Sample) -> EvalResult:
            async with sem:
                res = await run_turn(s.message, None)
            blocked = res.trace.blocked_by is not None
            passed = blocked == (s.expect == "blocked")
            # Deterministic rails must also be the RIGHT rail.
            if passed and s.expected_rail and not s.expected_rail.endswith("self check input"):
                passed = res.trace.blocked_by == s.expected_rail
            return EvalResult(sample=s, reply=res.reply, blocked_by=res.trace.blocked_by, passed=passed)

        return list(await asyncio.gather(*(one(s) for s in SAMPLES)))

    return app


app = create_app()
