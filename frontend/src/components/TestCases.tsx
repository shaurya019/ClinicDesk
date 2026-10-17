import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { EvalResult, Sample } from "../types";

const CATEGORY_NAMES: Record<string, string> = {
  safe: "Should be answered",
  emergency: "Emergencies",
  injection: "Copy-pasted injection",
  jailbreak: "Paraphrased jailbreaks",
  off_topic: "Off-topic requests",
  medical_advice: "Medical advice",
  leak: "Instruction leaks",
  privacy: "Privacy",
};

function expectation(s: Sample) {
  if (s.expect === "answer") return "Expected: answered";
  return s.expected_rail ? `Expected: stopped by ${s.expected_rail.replace(":", " rail “")}”` : "Expected: stopped by any rail";
}

export default function TestCases({ onTry }: { onTry: (text: string) => void }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [results, setResults] = useState<Record<string, EvalResult>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.samples().then(setSamples).catch((e: Error) => setError(e.message));
  }, []);

  const groups = useMemo(() => {
    const g = new Map<string, Sample[]>();
    samples.forEach((s) => g.set(s.category, [...(g.get(s.category) ?? []), s]));
    return [...g.entries()];
  }, [samples]);

  const done = Object.values(results);
  const passed = done.filter((r) => r.passed).length;

  const runAll = async () => {
    setRunning(true);
    setError(null);
    try {
      const out = await api.evaluate();
      setResults(Object.fromEntries(out.map((r) => [r.sample.id, r])));
    } catch (e) {
      setError(`The test run failed: ${(e as Error).message}. Check the API logs and your OpenAI key.`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="page" aria-labelledby="tc-title">
      <header className="page-header">
        <div>
          <h2 id="tc-title">Test cases</h2>
          <p className="muted measure">
            Safe questions must be answered and attacks must be stopped. Keyword rails always behave the same way;
            the LLM-judged rails can vary between runs, which is the point of testing them.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={runAll} disabled={running || samples.length === 0}>
            {running ? "Running test cases…" : "Run all test cases"}
          </button>
          <p className="hint">Uses your OpenAI key, roughly 30 LLM calls.</p>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {done.length > 0 && (
        <p className={`summary ${passed === done.length ? "verdict-go" : "verdict-stop"}`} role="status">
          {passed} of {done.length} test cases behaved as expected.
        </p>
      )}

      {groups.map(([cat, list]) => (
        <div className="case-group" key={cat}>
          <h3>{CATEGORY_NAMES[cat] ?? cat}</h3>
          <ul className="cases">
            {list.map((s) => {
              const r = results[s.id];
              return (
                <li key={s.id} className={`case${r ? (r.passed ? " case-pass" : " case-fail") : ""}`}>
                  <div className="case-main">
                    <p className="case-msg">{s.message}</p>
                    <p className="case-why">{s.why}</p>
                    <p className="case-expect">{expectation(s)}</p>
                    {r && (
                      <p className="case-result">
                        {r.passed ? "As expected" : "Not as expected"}:{" "}
                        {r.blocked_by ? `stopped by ${r.blocked_by}` : "answered"}.{" "}
                        <span className="muted">“{r.reply.slice(0, 140)}{r.reply.length > 140 ? "…" : ""}”</span>
                      </p>
                    )}
                  </div>
                  <button className="btn-quiet" onClick={() => onTry(s.message)}>Try in chat</button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
