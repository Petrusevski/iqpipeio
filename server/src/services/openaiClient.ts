// server/src/services/openaiClient.ts
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("[iqpipe] OPENAI_API_KEY is not set — AI assistant will be unavailable.");
}

// Pass a placeholder so the SDK doesn't throw at module load time.
// Routes that use openai should check for the key before calling.
export const openai = new OpenAI({
  apiKey: apiKey || "missing",
});
