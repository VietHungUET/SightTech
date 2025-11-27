import os
from functools import lru_cache

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()


@lru_cache(maxsize=1)
def _get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set; configure it before using question answering")
    return OpenAI(api_key=api_key)

def ask_general_question(question: str) -> str:
    system_prompt = (
        "You are a friendly assistant for blind users. "
        "Keep answers short, clear, and in plain language. "
        "Respond only in plain text — do NOT use Markdown, headings, lists, code blocks, or other special formatting (avoid '#', '*', '```', etc.). "
        "Do not reference visuals. Use a friendly, conversational tone."
    )

    client = _get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ]
    )

    return response.choices[0].message.content.strip()
