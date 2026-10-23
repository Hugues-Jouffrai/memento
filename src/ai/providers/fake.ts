import type { AiProvider, EmbedRequest, GenerateRequest } from "../types";

type Reply = string | Error | ((req: GenerateRequest) => string);

/** Deterministic provider for tests: replies are consumed in order, the last one repeats. */
/** A stable pseudo-embedding: the same text always gives the same unit vector; texts sharing words are close. */
export function fakeEmbedding(text: string, dimensions: number): number[] {
  const v = new Array<number>(dimensions).fill(0);
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    let h = 2166136261;
    for (const ch of word) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
    v[h % dimensions]! += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export function createFakeProvider(replies: Reply[]): AiProvider & { requests: GenerateRequest[]; embedRequests: EmbedRequest[] } {
  const requests: GenerateRequest[] = [];
  const embedRequests: EmbedRequest[] = [];
  let i = 0;
  return {
    name: "fake",
    requests,
    embedRequests,
    async embed(req) {
      embedRequests.push(req);
      return { vectors: req.texts.map((t) => fakeEmbedding(t, req.dimensions)), usage: { inputTokens: req.texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0) } };
    },
    async generate(req) {
      requests.push(req);
      const reply = replies[Math.min(i++, replies.length - 1)];
      if (reply === undefined) throw new Error("fake provider has no reply");
      if (reply instanceof Error) throw reply;
      const text = typeof reply === "function" ? reply(req) : reply;
      return { text, usage: { inputTokens: Math.ceil(req.prompt.length / 4), outputTokens: Math.ceil(text.length / 4) } };
    },
  };
}
