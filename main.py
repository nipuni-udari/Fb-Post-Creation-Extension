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
    format: str = Field(default="standard", max_length=20)


class CaptionResponse(BaseModel):
    description: str


class ImagePromptRequest(BaseModel):
    story: str = Field(min_length=1, max_length=20000)
    headline: str = Field(min_length=1, max_length=500)
    composition: str = Field(min_length=1, max_length=500)


class ImagePromptResponse(BaseModel):
    prompt: str


def caption_prompt(story: str, headline: str, format: str = "standard") -> str:
    now_then_rules = '''
- This is a "Now and Then" comparison. Write warmly about the contrast between modern life and the older British way suggested by the headline.
- For this format, override the general length: write 120 to 200 words in 3 to 5 short paragraphs.
- Include a believable, relatable memory-style moment for a UK reader aged 40 or over, but do not invent specific facts about the news story.
- End with a natural invitation to comment by choosing YES or NO, followed by 3 to 5 relevant UK nostalgia hashtags.'''
    comparison_rules = now_then_rules if format == "now-then" else ""
    return f'''Write a long Facebook post description based only on this news story and headline.

STORY:
"""{story}"""

HEADLINE: "{headline}"

AUDIENCE: People in Britain, especially thoughtful adults who care about fairness, household costs, public money, rules and whether ordinary people are being heard.

RULES
- Write in natural British English. Use British spelling and phrasing.
- Write roughly 600 to 800 words in 10 to 16 short paragraphs, easy to read on a phone. This should feel like a complete Facebook caption, not a short summary.
- Open with a striking emotional question or statement, sometimes using a concrete number or everyday comparison from the story. Make the reader feel why this matters in real life without sensationalising.
- Explain the relevant facts clearly and fairly. Do not invent details, motives, quotes, figures or consequences that are not in the story.
- Develop the human impact in a warm, conversational storytelling style. Use repetition sparingly for emphasis and ask a few rhetorical questions, like the example style, but keep every claim supported by the story.
- Connect the issue to everyday British life only when the story supports that connection. Acknowledge that people have different budgets, experiences and opinions.
- Build towards a memorable closing thought that returns to the central question or headline.
- End with one direct, open question inviting people to share their view in the comments.
- Do not use headings, bullet points, fake quotes, invented statistics or instructions to like and share. A small number of relevant emojis is allowed only when it genuinely suits the story.
{comparison_rules}

Output only the finished description.'''


def image_prompt(story: str, headline: str, composition: str) -> str:
    return f'''Write ONE detailed image-generation prompt for ChatGPT Image, Google Flow or Nano Banana for the photograph behind this Facebook post.

HEADLINE: "{headline}"
SOURCE STORY:
"""{story}"""

First identify the headline's central human question, the concrete noun it is about, and the real-world action or situation being discussed. Turn that into one specific visual scene. Never use a list of extracted headline words, abstract verbs, or vague concepts as the subject. Create a scene that makes someone scrolling stop and feel the issue before reading the words. The subject must be unmistakable and visually dominant, placed prominently in the foreground and midground. Add only secondary details that strengthen the story: a relevant object, place, vehicle, building, landscape or anonymous observer in the background. Never turn the image into a generic symbol or a collage.

Describe a high-emotional-engagement, ultra-realistic editorial photograph in a recognisably British setting when the story supports it. Make the emotion visible through expression, posture, hands, distance, gesture and body language. Match the mood precisely: urgent and tense for danger or conflict, worried and intimate for household impact, dignified and human for loss, quietly absurd for a wry story. Use believable scale, authentic materials, natural imperfections and documentary photojournalism. State the lighting, weather, atmosphere, camera position, lens and depth of field. Apply this layout constraint: {composition}

The final prompt must explicitly forbid text, captions, letters, numbers, logos, watermarks, signs with readable writing, recognisable public figures, politicians, celebrities, propaganda-poster styling, CGI, illustration, cartoon effects, distorted anatomy, extra fingers, duplicated people, exaggerated action-movie effects and a glossy stock-photo look. Do not invent facts, uniforms, locations or objects that the story does not support. If the headline asks about a policy or decision, show the real people, equipment, place or action affected by that decision, not the words of the question and not a random symbolic object.

Output only the finished prompt as one polished paragraph of 100 to 170 words. Begin with: "Ultra-realistic, high-emotional-engagement editorial photograph asking: {headline}". Then describe the dominant subject, composition, setting, atmosphere, emotion, lighting and camera. End with: "no text, no captions, no logos, no watermarks, no recognisable public figures, negative space where the caption sits". No preamble, quotes or labels.'''


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
        "max_tokens": 1400,
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


@app.post("/api/image-prompt", response_model=ImagePromptResponse)
async def generate_image_prompt(request: ImagePromptRequest) -> ImagePromptResponse:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on the server.")

    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": image_prompt(request.story, request.headline, request.composition)}],
        "temperature": 0.8,
        "max_tokens": 300,
    }
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=75) as client:
            response = await client.post(GROQ_URL, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach Groq.") from exc

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Groq rejected the image prompt request.")
    try:
        content = response.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError, AttributeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Groq returned an invalid image prompt.") from exc
    if not content:
        raise HTTPException(status_code=502, detail="Groq returned an empty image prompt.")
    return ImagePromptResponse(prompt=content)
