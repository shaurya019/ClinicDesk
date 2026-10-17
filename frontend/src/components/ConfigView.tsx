import { useEffect, useState } from "react";
import { api } from "../api";

const ABOUT: Record<string, string> = {
  "config.yml": "Models, the bot's instructions and clinic facts, and which rails run in which order.",
  "prompts.yml": "The prompts the LLM judges use for self check input and self check output.",
  "rails/messages.co": "Fixed bot messages. Refusals never come from the LLM.",
  "rails/input.co": "Input rails written in Colang: emergency routing and an injection keyword screen.",
  "rails/output.co": "Output rail written in Colang: the canary leak detector.",
};

function CodeLines({ text }: { text: string }) {
  return (
    <pre className="code code-file" tabIndex={0}>
      {text.split("\n").map((line, i) => {
        const trimmed = line.trimStart();
        const cls = trimmed.startsWith("#")
          ? "c-comment"
          : /^(define|if|else|stop|bot|\$)/.test(trimmed)
            ? "c-key"
            : "";
        return (
          <span key={i} className={`line ${cls}`}>
            {line || " "}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

export default function ConfigView() {
  const [files, setFiles] = useState<Record<string, string>>({});
  const [active, setActive] = useState("config.yml");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.config().then(setFiles).catch((e: Error) => setError(e.message));
  }, []);

  const names = Object.keys(files);

  return (
    <section className="page" aria-labelledby="cfg-title">
      <header className="page-header">
        <div>
          <h2 id="cfg-title">Config folder</h2>
          <p className="muted measure">
            This is everything NeMo Guardrails needs: <code>RailsConfig.from_path("config")</code> reads these files.
            Edit them in <code>backend/config</code>, then restart the API.
          </p>
        </div>
      </header>
      {error && <p className="error" role="alert">Couldn't load the config: {error}</p>}
      <div className="config-layout">
        <nav className="file-list" aria-label="Config files">
          {names.map((n) => (
            <button key={n} className={`file${n === active ? " is-active" : ""}`} aria-current={n === active}
              onClick={() => setActive(n)}>
              <span className="file-name">{n}</span>
              <span className="file-about">{ABOUT[n]}</span>
            </button>
          ))}
        </nav>
        {files[active] !== undefined && <CodeLines text={files[active]} />}
      </div>
    </section>
  );
}
