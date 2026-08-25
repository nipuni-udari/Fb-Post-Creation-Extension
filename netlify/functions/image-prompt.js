const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function prompt(story, headline, composition) {
  return `Write ONE detailed image-generation prompt for ChatGPT Image, Google Flow or Nano Banana for the photograph behind this Facebook post.

HEADLINE: "${headline}"
SOURCE STORY: """${story}"""

First identify the headline's central human question and the single subject that must carry it visually. Create a scene that makes someone scrolling stop and feel the issue before reading the words. The subject must be unmistakable and visually dominant, placed prominently in the foreground and midground. Add only secondary details that strengthen the story: a relevant object, place, vehicle, building, landscape or anonymous observer in the background. Never turn the image into a generic symbol or a collage.

Describe a high-emotional-engagement, ultra-realistic editorial photograph in a recognisably British setting when the story supports it. Make the emotion visible through expression, posture, hands, distance, gesture and body language. Match the mood precisely: urgent and tense for danger or conflict, worried and intimate for household impact, dignified and human for loss, quietly absurd for a wry story. Use believable scale, authentic materials, natural imperfections and documentary photojournalism. State the lighting, weather, atmosphere, camera position, lens and depth of field. Apply this layout constraint: ${composition}

The final prompt must explicitly forbid text, captions, letters, numbers, logos, watermarks, signs with readable writing, recognisable public figures, politicians, celebrities, propaganda-poster styling, CGI, illustration, cartoon effects, distorted anatomy, extra fingers, duplicated people, exaggerated action-movie effects and a glossy stock-photo look. Do not invent facts, uniforms, locations or objects that the story does not support.

Output only the finished prompt as one polished paragraph of 100 to 170 words. Begin with: "Ultra-realistic, high-emotional-engagement editorial photograph asking: ${headline}". Then describe the dominant subject, composition, setting, atmosphere, emotion, lighting and camera. End with: "no text, no captions, no logos, no watermarks, no recognisable public figures, negative space where the caption sits". No preamble, quotes or labels.`;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { detail: 'POST required.' });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return json(500, { detail: 'GROQ_API_KEY is not configured in Netlify.' });

  let request;
  try { request = JSON.parse(event.body || '{}'); } catch { return json(400, { detail: 'Invalid JSON request.' }); }
  const story = typeof request.story === 'string' ? request.story.trim() : '';
  const headline = typeof request.headline === 'string' ? request.headline.trim() : '';
  const composition = typeof request.composition === 'string' ? request.composition.trim() : '';
  if (!story || story.length > 20000 || !headline || headline.length > 500 || !composition || composition.length > 500) {
    return json(400, { detail: 'A valid story, headline and layout are required.' });
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt(story, headline, composition) }],
        temperature: 0.8,
        max_tokens: 300
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(502, { detail: data?.error?.message || 'Groq rejected the image prompt request.' });
    const result = data?.choices?.[0]?.message?.content?.trim();
    if (!result) return json(502, { detail: 'Groq returned an empty image prompt.' });
    return json(200, { prompt: result });
  } catch { return json(502, { detail: 'Could not reach Groq.' }); }
};