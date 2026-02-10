import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hugging Face router as OpenAI-compatible API
const hfClient = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HF_TOKEN
});

// Model on router
const HF_ROUTER_MODEL = "deepseek-ai/DeepSeek-R1:fastest";

// Call HF router and strip <think>...</think>
async function callHFRouter(textPrompt) {
  const userDescription =
    textPrompt && textPrompt.trim().length > 0
      ? textPrompt.trim()
      : "calm, scenic, nature-focused getaway";

  const systemPrompt =
    "You are a concise travel planner AI. " +
    "From the user description, infer the aesthetic (mountain, beach, city, desert, nightlife, etc.) " +
    "and propose EXACTLY 3 real-world destinations that match the vibe. " +
    "For each destination, write: 1 short line summary + 2 bullet points (Day 1, Day 2) + one total budget in INR. " +
    "Keep each destination under 6 lines. Do NOT explain your reasoning, just output the plan.";

  const completion = await hfClient.chat.completions.create({
    model: HF_ROUTER_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `User mood / aesthetic description: "${userDescription}".`
      }
    ],
    temperature: 0.7,
    max_tokens: 900
  });

  let raw = completion.choices?.[0]?.message?.content?.toString() || "";

  // 🔹 Hard cleanup of <think> blocks
  const thinkStart = raw.indexOf("<think>");
  if (thinkStart !== -1) {
    const thinkEnd = raw.indexOf("</think>");
    if (thinkEnd !== -1 && thinkEnd > thinkStart) {
      // Remove from <think> to </think>
      raw = raw.slice(thinkEnd + "</think>".length).trim();
    } else {
      // No closing tag, drop everything from <think> onwards
      raw = raw.slice(0, thinkStart).trim();
    }
  }

  // If after cleanup still starts with "<think", strip first line
  if (raw.startsWith("<think")) {
    const firstNewline = raw.indexOf("\n");
    if (firstNewline !== -1) {
      raw = raw.slice(firstNewline + 1).trim();
    }
  }

  return raw;
}

// API route the frontend calls
app.post("/api/plan-trip", async (req, res) => {
  try {
    const { textPrompt } = req.body;

    if (!process.env.HF_TOKEN) {
      throw new Error("Missing HF_TOKEN in env");
    }

    const responseText = await callHFRouter(textPrompt);

    

    // Optional: store raw text in Supabase
    const { error } = await supabase.from("trips").insert({
      user_identifier: "guest",
      prompt: textPrompt || "text-only",
      plan: { text: responseText }
    });

    if (error) {
      console.error("Supabase insert error:", error);
    }

    // Send ONLY cleaned AI response to frontend
    res.json({ response: responseText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to plan trip" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
