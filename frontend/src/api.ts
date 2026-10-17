import type { ChatResponse, EvalResult, Health, Sample, Stats, TurnRecord } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* body was not JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/api/health"),
  chat: (message: string, conversation_id: string | null) =>
    request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, conversation_id }),
    }),
  samples: () => request<Sample[]>("/api/samples"),
  evaluate: () => request<EvalResult[]>("/api/eval", { method: "POST" }),
  config: () => request<Record<string, string>>("/api/config"),
  logs: (limit = 50) => request<TurnRecord[]>(`/api/logs?limit=${limit}`),
  stats: () => request<Stats>("/api/stats"),
};
