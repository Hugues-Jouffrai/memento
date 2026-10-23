import { GoogleGenAI } from "@google/genai";
import type { AiProvider } from "../types";

const sum = (xs: (number | undefined)[]) => xs.reduce<number>((n, x) => n + (x ?? 0), 0);

export function createGeminiProvider(apiKey: string): AiProvider {
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing or empty");
  const client = new GoogleGenAI({ apiKey });
  return {
    name: "gemini",
    async generate(req) {
      const res = await client.models.generateContent({
        model: req.model,
        contents: req.files?.length
          ? [{ role: "user", parts: [...req.files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data.toString("base64") } })), { text: req.prompt }] }]
          : req.prompt,
        config: {
          responseMimeType: "application/json",
          ...(req.jsonSchema ? { responseJsonSchema: req.jsonSchema } : {}),
        },
      });
      const usage = res.usageMetadata;
      return {
        text: res.text ?? "",
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          // Thinking tokens are billed as output.
          outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        },
      };
    },
    async embed(req) {
      // One Content per text: several texts in one Content would be merged into a single embedding.
      const contents = req.texts.map((text) => ({ parts: [{ text }] }));
      const res = await client.models.embedContent({ model: req.model, contents, config: { outputDimensionality: req.dimensions } });
      const vectors = (res.embeddings ?? []).map((e) => e.values ?? []);
      // The response may not carry token counts; countTokens is free and gives the billed input size.
      let inputTokens = sum((res.embeddings ?? []).map((e) => e.statistics?.tokenCount));
      if (!inputTokens) inputTokens = (await client.models.countTokens({ model: req.model, contents })).totalTokens ?? 0;
      return { vectors, usage: { inputTokens } };
    },
  };
}
