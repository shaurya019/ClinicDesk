import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import ChatPanel from "./components/ChatPanel";
import ConfigView from "./components/ConfigView";
import LogView from "./components/LogView";
import TestCases from "./components/TestCases";
import TrackView from "./components/TrackView";
import type { Health, UiTurn } from "./types";

type Tab = "chat" | "tests" | "config" | "log";
const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "tests", label: "Test cases" },
  { id: "config", label: "Config" },
  { id: "log", label: "Log" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [health, setHealth] = useState<Health | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<UiTurn[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setApiDown(true));
  }, []);

  const send = useCallback(async (text: string) => {
    const tempId = `pending-${Date.now()}`;
    setTurns((t) => [...t, { id: tempId, user: text }]);
    setSelectedId(tempId);
    setBusy(true);
    try {
      const res = await api.chat(text, conversationId);
      setConversationId(res.conversation_id);
      setTurns((t) => t.map((x) => (x.id === tempId
        ? { id: res.turn_id, user: text, reply: res.reply, blocked: res.blocked, trace: res.trace }
        : x)));
      setSelectedId(res.turn_id);
    } catch (e) {
      setTurns((t) => t.map((x) => (x.id === tempId
        ? { ...x, error: `Not sent: ${(e as Error).message}. Check that the API is running and your OpenAI key is set.` }
        : x)));
    } finally {
      setBusy(false);
    }
  }, [conversationId]);

  const reset = () => {
    setConversationId(null);
    setTurns([]);
    setSelectedId(null);
  };

  const tryInChat = (text: string) => {
    setTab("chat");
    void send(text);
  };

  const selected = turns.find((t) => t.id === selectedId) ?? null;

  return (
    <div className={`app app-${tab}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span /><span />
          </span>
          <div>
            <h1>ClinicDesk</h1>
            <p className="brand-sub">
              Sunrise Family Clinic's front desk, guarded by NeMo Guardrails
              {health ? ` on ${health.model}` : ""}
            </p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={`tab${tab === t.id ? " is-active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {apiDown && (
        <p className="banner" role="alert">
          The API isn't reachable. Start it with <code>uvicorn app.main:app --port 8000</code> in
          <code> backend/</code>, or run <code>docker compose up</code>.
        </p>
      )}

      <main className={`main main-${tab}`}>
        {tab === "chat" && (
          <div className="chat-layout">
            <ChatPanel turns={turns} selectedId={selectedId} busy={busy}
              onSelect={setSelectedId} onSend={send} onReset={reset} />
            <TrackView health={health} turn={selected} />
          </div>
        )}
        {tab === "tests" && <TestCases onTry={tryInChat} />}
        {tab === "config" && <ConfigView />}
        {tab === "log" && <LogView />}
      </main>
    </div>
  );
}
