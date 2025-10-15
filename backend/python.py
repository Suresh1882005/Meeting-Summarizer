"""
Summarizer: chunk transcripts if needed, call LLM, return structured JSON.
This example uses OpenAI Chat Completions via the HTTP endpoint.
"""

import os
import json
import math
import requests
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

SYSTEM_PROMPT = """You are a meeting summarization assistant. Given a meeting transcript, produce a JSON object with these keys:
- short_summary: one-paragraph summary (2-3 sentences)
- decisions: list of objects {decision: str, context: str}
- action_items: list of objects {task: str, owner: str or null, due: str or null}
- participants: list of participant names (or empty)
- important_topics: list of keywords (3-8)
Return only valid JSON. If you cannot find info, return null or empty lists.
"""

def split_chunks(text, max_chars=6000):
    """
    Naive split by chars into chunks that fit model context.
    Adjust chunking logic for better semantic splits if needed.
    """
    if len(text) <= max_chars:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        # try to break at newline for readability
        if end < len(text):
            newline = text.rfind("\n", start, end)
            if newline > start:
                end = newline
        chunks.append(text[start:end])
        start = end
    return chunks

def call_openai_chat(messages, max_tokens=800, temperature=0.0):
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature
    }
    r = requests.post(url, headers=headers, json=payload, timeout=120)
    r.raise_for_status()
    return r.json()

async def summarize_transcript(transcript_text, metadata=None):
    # 1) chunk transcript
    chunks = split_chunks(transcript_text, max_chars=5000)
    chunk_summaries = []

    for i, chunk in enumerate(chunks):
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Transcript chunk {i+1}/{len(chunks)}:\n\n{chunk}"}
        ]
        resp = call_openai_chat(messages)
        out = resp["choices"][0]["message"]["content"]
        # try parse JSON, fallback to raw text
        try:
            parsed = json.loads(out)
        except Exception:
            parsed = {"raw": out}
        chunk_summaries.append(parsed)

    # 2) if multiple chunks, synthesize
    if len(chunk_summaries) == 1:
        return chunk_summaries[0]
    # create a synthesis prompt: combine chunk summaries
    synth_input = json.dumps(chunk_summaries, indent=2)
    synth_messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"These are JSON summaries for transcript chunks:\n{synth_input}\n\nPlease merge them into one final JSON meeting summary with the same schema. Remove duplicates and consolidate action items."}
    ]
    resp = call_openai_chat(synth_messages, max_tokens=1000)
    out = resp["choices"][0]["message"]["content"]
    try:
        final = json.loads(out)
    except Exception:
        final = {"raw": out, "chunks": chunk_summaries}
    return final
