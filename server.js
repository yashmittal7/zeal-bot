import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string" || message.trim() === "") {
      return res.status(400).json({ error: "Message is required." });
    }

    // Format prior history for the Gemini SDK
    const formattedHistory = history.map((turn) => ({
      role: turn.role,          // "user" or "model"
      parts: [{ text: turn.text }],
    }));

    // Start a chat session with existing history
    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      history: formattedHistory,
      config: {
        systemInstruction:
          "You are a helpful, thoughtful, and concise AI assistant. " +
          "Format your responses clearly. When using lists or code, structure them well.",
      },
    });

    const response = await chat.sendMessage({ message: message.trim() });
    const botText = response.text;

    res.json({ reply: botText });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({
      error: "Something went wrong while contacting the Gemini API.",
      details: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Gemini Chatbot running at http://localhost:${PORT}\n`);
});