// Mirrors backend/app/schemas.py. Keep the two in sync.

export type RailType = "input" | "output" | "generation" | "dialog" | "retrieval" | "other";

export interface LLMCall {
  task: string;
  duration_ms: number;
  total_tokens: number | null;
  prompt: string | null;
  completion: string | null;
}

export interface RailStep {
  type: RailType;
  name: string;
  status: "passed" | "blocked";
  duration_ms: number;
  decisions: string[];
  llm_calls: LLMCall[];
}

export interface Trace {
  rails: RailStep[];
  llm_calls: LLMCall[];
  blocked_by: string | null;
  total_ms: number;
  llm_calls_count: number;
  total_tokens: number;
}

export interface ChatResponse {
  conversation_id: string;
  turn_id: string;
  reply: string;
  blocked: boolean;
  trace: Trace;
}

export interface TurnRecord {
  turn_id: string;
  conversation_id: string;
  created_at: string;
  user_message: string;
  reply: string;
  blocked: boolean;
  blocked_by: string | null;
  trace: Trace;
}

export interface Health {
  status: string;
  model: string;
  input_rails: string[];
  output_rails: string[];
  expose_prompts: boolean;
}

export interface Sample {
  id: string;
  category: string;
  message: string;
  expect: "answer" | "blocked";
  expected_rail: string | null;
  why: string;
}

export interface EvalResult {
  sample: Sample;
  reply: string;
  blocked_by: string | null;
  passed: boolean;
}

export interface Stats {
  total_turns: number;
  blocked_turns: number;
  blocked_by_rail: Record<string, number>;
  total_tokens: number;
  total_llm_calls: number;
}

/** A turn as the chat UI holds it (pending while the request is in flight). */
export interface UiTurn {
  id: string;
  user: string;
  reply?: string;
  blocked?: boolean;
  trace?: Trace;
  error?: string;
}
