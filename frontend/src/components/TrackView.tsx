import { useState } from "react";
import { buildStations, describeBlock, type Station } from "../rails";
import type { Health, UiTurn } from "../types";

const LAMP_TEXT = { go: "Passed", stop: "Stopped here", unlit: "Not reached" } as const;

function stateText(s: Station): string {
  if (s.key === "start") return s.lamp === "unlit" ? "Waiting" : "Received";
  if (s.key === "end") return s.lamp === "unlit" ? "Waiting" : s.lamp === "stop" ? "Fixed refusal" : "Delivered";
  return LAMP_TEXT[s.lamp];
}

function StationRow({ s, last }: { s: Station; last: boolean }) {
  const [open, setOpen] = useState(false);
  const expandable = s.calls.length > 0 || s.decisions.length > 0;
  const tokens = s.calls.reduce((n, c) => n + (c.total_tokens ?? 0), 0);

  return (
    <li className={`station lamp-${s.lamp} kind-${s.type}${last ? " is-last" : ""}`}>
      <span className={`signal${s.usesLLM ? " uses-llm" : ""}`} aria-hidden="true" />
      <div className="station-body">
        <div className="station-head">
          {expandable ? (
            <button className="station-name" aria-expanded={open} onClick={() => setOpen(!open)}>
              {s.label}
            </button>
          ) : (
            <span className="station-name">{s.label}</span>
          )}
          <span className="station-state">{stateText(s)}</span>
        </div>
        <p className="station-meta">
          {s.type !== "endpoint" && s.type !== "generation" && <span className="tag">{s.type} rail</span>}
          {s.usesLLM ? <span className="tag tag-llm">asks the LLM</span> : s.type === "input" || s.type === "output" ? <span className="tag">no LLM call</span> : null}
          {s.durationMs !== undefined && s.lamp !== "unlit" && <span>{s.durationMs} ms</span>}
          {tokens > 0 && <span>{tokens} tokens</span>}
        </p>
        <p className="station-about">{s.about}</p>
        {open && (
          <div className="station-detail">
            {s.decisions.length > 0 && (
              <p className="decisions">
                Flow steps: {s.decisions.join(", then ")}
              </p>
            )}
            {s.calls.map((c, i) => (
              <div className="llm-call" key={i}>
                <p className="llm-call-head">
                  LLM task <code>{c.task}</code> took {c.duration_ms} ms
                </p>
                {c.prompt != null ? (
                  <>
                    <pre className="code" tabIndex={0}>{c.prompt}</pre>
                    <p className="llm-call-head">It answered</p>
                    <pre className="code code-answer" tabIndex={0}>{c.completion || "(empty: treated as unsafe)"}</pre>
                  </>
                ) : (
                  <p className="muted">Prompts are hidden. Set EXPOSE_PROMPTS=true to see them.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export default function TrackView({ health, turn }: { health: Health | null; turn: UiTurn | null }) {
  const stations = buildStations(health, turn?.trace, !!turn?.blocked);
  const t = turn?.trace;

  return (
    <section className="track-panel" aria-labelledby="track-title">
      <header className="track-header">
        <h2 id="track-title">Rail line</h2>
        {t ? (
          <p className={`verdict ${turn?.blocked ? "verdict-stop" : "verdict-go"}`}>
            {describeBlock(t.blocked_by)}. {t.llm_calls_count} LLM {t.llm_calls_count === 1 ? "call" : "calls"},{" "}
            {(t.total_ms / 1000).toFixed(2)} s{t.total_tokens ? `, ${t.total_tokens} tokens` : ""}.
          </p>
        ) : (
          <p className="muted">
            {turn ? "Waiting for the rails…" : "Send a message, then pick any reply to see the path it took."}
          </p>
        )}
      </header>

      {turn && <p className="track-message">“{turn.user}”</p>}

      <ol className="track">
        {stations.map((s, i) => (
          <StationRow key={s.key} s={s} last={i === stations.length - 1} />
        ))}
      </ol>

      <p className="legend">
        <span><span className="legend-dot dot-go" /> passed</span>
        <span><span className="legend-dot dot-stop" /> stopped the turn</span>
        <span><span className="legend-dot dot-unlit" /> never ran</span>
        <span><span className="legend-dot dot-llm" /> costs an LLM call</span>
      </p>
    </section>
  );
}
