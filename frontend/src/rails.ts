// Turns a backend Trace + the configured rail order into "stations" on the track.
import type { Health, LLMCall, RailStep, RailType, Trace } from "./types";

export type Lamp = "go" | "stop" | "unlit";

export interface Station {
  key: string;
  label: string;
  type: RailType | "endpoint";
  lamp: Lamp;
  usesLLM: boolean;
  about: string;
  durationMs?: number;
  calls: LLMCall[];
  decisions: string[];
}

const ABOUT: Record<string, string> = {
  "check emergency": "Colang rule. Spots emergency words and replies with 108 straight away, without asking the LLM.",
  "check injection phrases": "Colang rule. Stops copy-pasted injection phrases for free.",
  "self check input": "The LLM judges the message against the topic and safety policy in prompts.yml.",
  "check canary leak": "Colang rule. Blocks any reply that contains the hidden marker from config.yml.",
  "self check output": "The LLM reviews the draft reply against the output policy before the patient sees it.",
};

const TASK_FOR: Record<string, string> = {
  "self check input": "self_check_input",
  "self check output": "self_check_output",
  generation: "general",
};

function callsFor(name: string, rail: RailStep | undefined, trace: Trace): LLMCall[] {
  if (rail && rail.llm_calls.length) return rail.llm_calls;
  const task = TASK_FOR[name];
  return task ? trace.llm_calls.filter((c) => c.task === task) : [];
}

function railStation(name: string, type: RailType, trace: Trace | undefined): Station {
  const rail = trace?.rails.find((r) => r.name === name && r.type === type);
  const usesLLM = name.startsWith("self check");
  return {
    key: `${type}:${name}`,
    label: name,
    type,
    lamp: !rail ? "unlit" : rail.status === "blocked" ? "stop" : "go",
    usesLLM,
    about: ABOUT[name] ?? (usesLLM ? "Asks the LLM to judge." : `Custom ${type} rail.`),
    durationMs: rail?.duration_ms,
    calls: trace ? callsFor(name, rail, trace) : [],
    decisions: rail?.decisions ?? [],
  };
}

export function buildStations(health: Health | null, trace: Trace | undefined, blocked: boolean): Station[] {
  const inputs = health?.input_rails ?? trace?.rails.filter((r) => r.type === "input").map((r) => r.name) ?? [];
  const outputs = health?.output_rails ?? trace?.rails.filter((r) => r.type === "output").map((r) => r.name) ?? [];
  const generation = trace?.rails.find((r) => r.type === "generation");

  const mainLLM: Station = {
    key: "generation",
    label: "Main LLM writes the answer",
    type: "generation",
    lamp: generation ? "go" : "unlit",
    usesLLM: true,
    about: "Runs only if every input rail passed. Uses the general instructions and clinic facts from config.yml.",
    durationMs: generation?.duration_ms,
    calls: trace ? callsFor("generation", generation, trace) : [],
    decisions: [],
  };

  return [
    { key: "start", label: "Patient's message", type: "endpoint", lamp: trace ? "go" : "unlit", usesLLM: false,
      about: "Validated by FastAPI first (1 to 1000 characters).", calls: [], decisions: [] },
    ...inputs.map((n) => railStation(n, "input", trace)),
    mainLLM,
    ...outputs.map((n) => railStation(n, "output", trace)),
    { key: "end", label: blocked ? "Canned reply sent" : "Reply sent", type: "endpoint",
      lamp: trace ? (blocked ? "stop" : "go") : "unlit", usesLLM: false,
      about: blocked
        ? "A rail stopped the turn, so NeMo sent the fixed message from a 'define bot' block instead."
        : "The answer passed every rail.",
      calls: [], decisions: [] },
  ];
}

export function describeBlock(blockedBy: string | null): string {
  if (!blockedBy) return "Passed every rail";
  const [type, name] = blockedBy.split(":");
  return `Stopped by ${type} rail “${name}”`;
}
