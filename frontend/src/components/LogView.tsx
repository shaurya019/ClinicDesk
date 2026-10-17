import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Stats, TurnRecord } from "../types";

export default function LogView() {
  const [logs, setLogs] = useState<TurnRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.logs(50), api.stats()])
      .then(([l, s]) => {
        setLogs(l);
        setStats(s);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const max = Math.max(1, ...Object.values(stats?.blocked_by_rail ?? {}));

  return (
    <section className="page" aria-labelledby="log-title">
      <header className="page-header">
        <div>
          <h2 id="log-title">Log</h2>
          <p className="muted measure">Every turn is stored in MongoDB with its full rail trace.</p>
        </div>
        <div className="page-actions">
          <button className="btn-quiet" onClick={load}>Refresh</button>
        </div>
      </header>

      {error && <p className="error" role="alert">Couldn't load the log: {error}</p>}

      {stats && (
        <p className="stats-line">
          {stats.total_turns} turns so far, {stats.blocked_turns} stopped by a rail, {stats.total_llm_calls} LLM
          calls and {stats.total_tokens.toLocaleString()} tokens.
        </p>
      )}

      {stats && Object.keys(stats.blocked_by_rail).length > 0 && (
        <div className="bars" aria-label="Turns stopped, by rail">
          {Object.entries(stats.blocked_by_rail).map(([rail, n]) => (
            <div className="bar-row" key={rail}>
              <span className="bar-label">{rail.split(":")[1]} ({rail.split(":")[0]})</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / max) * 100}%` }} /></span>
              <span className="bar-n">{n}</span>
            </div>
          ))}
        </div>
      )}

      {logs.length === 0 ? (
        <p className="muted">No turns yet. Send a message in Chat and it appears here.</p>
      ) : (
        <div className="table-wrap">
          <table className="log-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Message</th>
                <th scope="col">Outcome</th>
                <th scope="col">LLM calls</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((t) => (
                <tr key={t.turn_id}>
                  <td className="nowrap">{new Date(t.created_at).toLocaleTimeString()}</td>
                  <td>{t.user_message}</td>
                  <td className={t.blocked ? "out-stop" : "out-go"}>
                    {t.blocked_by ? `Stopped: ${t.blocked_by.split(":")[1]} (${t.blocked_by.split(":")[0]})` : "Answered"}
                  </td>
                  <td>{t.trace.llm_calls_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
