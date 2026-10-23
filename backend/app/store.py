"""MongoDB persistence: one document per conversation turn (message, reply, full rail trace).

NeMo itself is stateless between calls: we keep the history and send the last
few messages with each request. Storing every trace also gives you an audit
log: "which rail blocked what, how often, and how much did it cost?"
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pymongo import DESCENDING, MongoClient
from pymongo.database import Database

from .schemas import Trace, TurnRecord


class Store:
    def __init__(self, db: Database):
        self.turns = db["turns"]
        self.turns.create_index([("conversation_id", 1), ("created_at", 1)])
        self.turns.create_index([("created_at", DESCENDING)])

    @classmethod
    def connect(cls, uri: str, db_name: str) -> "Store":
        client = MongoClient(uri, serverSelectionTimeoutMS=3000, tz_aware=True)  # dates come back as UTC-aware
        client.admin.command("ping")          # fail fast with a clear error if Mongo is down
        return cls(client[db_name])

    @staticmethod
    def new_id() -> str:
        return uuid.uuid4().hex[:16]

    def history(self, conversation_id: str, max_turns: int) -> list[dict]:
        """Last N turns as OpenAI-style messages. Blocked turns are left out on purpose:
        a jailbreak attempt that was refused should not sit in the context for the next turn."""
        docs = list(self.turns.find({"conversation_id": conversation_id, "blocked": False})
                    .sort("created_at", DESCENDING).limit(max_turns))
        messages: list[dict] = []
        for d in reversed(docs):
            messages.append({"role": "user", "content": d["user_message"]})
            messages.append({"role": "assistant", "content": d["reply"]})
        return messages

    def save(self, conversation_id: str, user_message: str, reply: str, trace: Trace) -> TurnRecord:
        record = TurnRecord(
            turn_id=self.new_id(), conversation_id=conversation_id,
            created_at=datetime.now(timezone.utc), user_message=user_message, reply=reply,
            blocked=trace.blocked_by is not None, blocked_by=trace.blocked_by, trace=trace,
        )
        self.turns.insert_one({"_id": record.turn_id, **record.model_dump(mode="python")})
        return record

    def conversation(self, conversation_id: str) -> list[TurnRecord]:
        docs = self.turns.find({"conversation_id": conversation_id}).sort("created_at", 1)
        return [TurnRecord.model_validate(d) for d in docs]

    def recent(self, limit: int) -> list[TurnRecord]:
        return [TurnRecord.model_validate(d) for d in self.turns.find().sort("created_at", DESCENDING).limit(limit)]

    def stats(self) -> dict:
        total = self.turns.count_documents({})
        blocked = self.turns.count_documents({"blocked": True})
        by_rail = {row["_id"]: row["count"] for row in self.turns.aggregate([
            {"$match": {"blocked": True}},
            {"$group": {"_id": "$blocked_by", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ])}
        tokens = next(iter(self.turns.aggregate([
            {"$group": {"_id": None, "t": {"$sum": "$trace.total_tokens"}, "c": {"$sum": "$trace.llm_calls_count"}}}
        ])), {"t": 0, "c": 0})
        return {"total_turns": total, "blocked_turns": blocked, "blocked_by_rail": by_rail,
                "total_tokens": tokens["t"], "total_llm_calls": tokens["c"]}
