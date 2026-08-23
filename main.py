import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

load_dotenv()

ROOT = Path(__file__).resolve().parent
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"

app = FastAPI(title="Udari Lifestyle Post Creator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


class CaptionRequest(BaseModel):
    story: str = Field(min_length=1, max_length=20000)
    headline: str = Field(min_length=1, max_length=500)


class CaptionResponse(BaseModel):
    description: str


def caption_prompt(story: str, headline: str) -> str:
    return f'''Write a long Facebook post description based only on this news story and headline.

STORY:
"""{story}"""

HEADLINE: "{headline}"

AUDIENCE: People in Britain, especially thoughtful adults who care about fairness, household costs, public money, rules and whether ordinary people are being heard.

RULES
- Write in natural British English. Use British spelling and phrasing.
- Write 130 to 190 words in 3 or 4 short paragraphs, easy to read on a phone.
- Open with an emotional line that makes the reader feel why this matters in real life. Build curiosity without sensationalising.
- Explain the relevant facts clearly and fairly. Do not invent details, motives, quotes, figures or consequences that are not in the story.
- Connect the issue to everyday British life only when the story supports that connection.
- End with one direct, open question inviting people to share their view in the comments.
- No hashtags, emojis, headings, quotation marks around the whole answer, or instructions to like and share.

Output only the finished description.'''


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")


@app.post("/api/caption", response_model=CaptionResponse)
async def generate_caption(request: CaptionRequest) -> CaptionResponse:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on the server.")

    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": caption_prompt(request.story, request.headline)}],
        "temperature": 0.8,
        "max_tokens": 500,
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=75) as client:
            response = await client.post(GROQ_URL, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach Groq.") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("error", {}).get("message", "Groq rejected the request.")
        except ValueError:
            detail = "Groq rejected the request."
        raise HTTPException(status_code=502, detail=detail)

    try:
        content = response.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError, AttributeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Groq returned an invalid response.") from exc

    if not content:
        raise HTTPException(status_code=502, detail="Groq returned an empty description.")
    return CaptionResponse(description=content)
