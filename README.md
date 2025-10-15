# Meeting Summarizer

Objective: Transcribe meeting audio and generate action-oriented summaries (transcript, decisions, action items).

Spec based on the uploaded brief (Meeting Summarizer). :contentReference[oaicite:1]{index=1}

## Features
- Upload audio file via a minimal frontend
- Pluggable ASR adapters (OpenAI, Azure)
- LLM-based summarizer producing structured JSON:
  - short_summary, decisions, action_items, participants, important_topics
- Simple persistence using SQLite (optional)

## Quickstart (local)
1. Clone repo.
2. Create and activate venv:
   ```bash
   python -m venv venv
   source venv/bin/activate
   cd backend
   pip install -r requirements.txt
