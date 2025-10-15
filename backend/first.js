// server.js (complete)
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const PORT = process.env.PORT || 8000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASR_MODEL = process.env.OPENAI_ASR_MODEL || "whisper-1";
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});
const upload = multer({ storage });

app.get("/", (_, res) => res.json({ ok: true, msg: "Meeting Summarizer API" }));

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const filePath = path.resolve(req.file.path);
    console.log("Received file:", filePath);

    // Transcribe
    let transcript;
    if (!OPENAI_API_KEY) {
      // MOCK transcription when no API key is available
      transcript = `MOCK TRANSCRIPT: Received file ${req.file.originalname}. (No OPENAI_API_KEY set)`;
      console.log("Using mock transcript because OPENAI_API_KEY not set.");
    } else {
      transcript = await transcribeOpenAI(filePath);
    }
    console.log("Transcript length:", transcript ? transcript.length : 0);

    // Summarize (mock if no API key)
    let summary;
    if (!OPENAI_API_KEY) {
      summary = {
        short_summary: "MOCK SUMMARY — no API key provided",
        decisions: [],
        action_items: [],
        participants: [],
        important_topics: []
      };
    } else {
      summary = await summarizeOpenAI(transcript);
    }

    return res.json({ filename: req.file.filename, transcript, summary });
  } catch (err) {
    console.error("Upload error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: String(err) });
  }
});

async function transcribeOpenAI(filePath) {
  const url = "https://api.openai.com/v1/audio/transcriptions";
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  form.append("model", OPENAI_ASR_MODEL);
  const headers = { ...form.getHeaders(), Authorization: `Bearer ${OPENAI_API_KEY}` };
  const r = await axios.post(url, form, { headers, timeout: 5 * 60 * 1000 });
  // r.data may have `text` or `transcript` depending on API; handle both
  return r.data.text || r.data.transcript || JSON.stringify(r.data);
}

async function summarizeOpenAI(transcript) {
  const url = "https://api.openai.com/v1/chat/completions";
  const system = `You are a meeting summarization assistant. Output JSON with fields:
short_summary, decisions, action_items, participants, important_topics.`;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: transcript }
  ];
  const headers = { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" };
  const body = { model: OPENAI_CHAT_MODEL, messages, temperature: 0.0, max_tokens: 800 };
  const r = await axios.post(url, body, { headers, timeout: 120000 });
  // Try parse; the assistant should return JSON text
  const raw = r.data.choices?.[0]?.message?.content;
  try {
    return JSON.parse(raw);
  } catch (e) {
    // fallback: return raw string in object so frontend can show it
    return { raw: raw };
  }
}

app.listen(PORT, () => {
  console.log(` Server running at http://localhost:${PORT}  (uploads -> ${UPLOAD_DIR})`);
});
