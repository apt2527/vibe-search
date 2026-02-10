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
      raw = raw.slice(thinkEnd + "</think>".length).trim();
    } else {
      raw = raw.slice(0, thinkStart).trim();
    }
  }

  if (raw.startsWith("<think")) {
    const firstNewline = raw.indexOf("\n");
    if (firstNewline !== -1) {
      raw = raw.slice(firstNewline + 1).trim();
    }
  }

  return raw;
}

// Plan-trip: generate + auto‑save for user_identifier
app.post("/api/plan-trip", async (req, res) => {
  try {
    const { textPrompt, userIdentifier } = req.body;

    if (!process.env.HF_TOKEN) {
      throw new Error("Missing HF_TOKEN in env");
    }

    const responseText = await callHFRouter(textPrompt);

    const extraLinks =
      '\n\nBook your trip:\n' +
      '<a href="https://www.booking.com" target="_blank" rel="noopener noreferrer">Hotels on Booking.com</a>\n' +
      '<a href="https://www.skyscanner.co.in" target="_blank" rel="noopener noreferrer">Flights on Skyscanner</a>\n';

    const finalText = responseText + extraLinks;

    const { error: saveError } = await supabase.from("trips").insert({
      user_identifier: userIdentifier || "guest",
      prompt: textPrompt || "text-only",
      plan: { text: finalText },
      source: "auto"
    });

    if (saveError) {
      console.error("Supabase insert error:", saveError);
    }

    return res.json({ response: finalText });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to plan trip" });
  }
});

// Save trip manually (from Save My Trip button)
app.post("/api/save-trip", async (req, res) => {
  try {
    const { guestName, tripPlan, aestheticPrompt } = req.body;

    if (!guestName || !tripPlan) {
      return res
        .status(400)
        .json({ error: "Missing required fields: guestName and tripPlan" });
    }

    const { data, error } = await supabase
      .from("trips")
      .insert({
        user_identifier: guestName,
        prompt: aestheticPrompt || "saved-trip",
        plan: {
          text: tripPlan,
          saved_at: new Date().toISOString()
        },
        created_at: new Date().toISOString(),
        source: "manual"
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("Supabase save error:", error);
      return res.status(500).json({ error: "Failed to save trip" });
    }

    return res.json({
      success: true,
      message: `Trip saved successfully for ${guestName}!`,
      tripId: data.id,
      savedAt: data.created_at
    });
  } catch (err) {
    console.error("Save trip error:", err);
    return res
      .status(500)
      .json({ error: "Server error while saving trip" });
  }
});

// Get saved trips for a user (by email / identifier)
app.get("/api/my-trips", async (req, res) => {
  try {
    const user = req.query.user;
    if (!user) {
      return res.status(400).json({ error: "Missing user query param" });
    }

    const { data, error } = await supabase
      .from("trips")
      .select("id, prompt, plan, created_at")
      .eq("user_identifier", user)
      .eq("source", "manual")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Supabase fetch trips error:", error);
      return res.status(500).json({ error: "Failed to fetch trips" });
    }

    return res.json({ trips: data || [] });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Server error while fetching trips" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
