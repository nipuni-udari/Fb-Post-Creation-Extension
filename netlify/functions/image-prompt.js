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
  return `Write ONE image-generation prompt for ChatGPT Image, Google Flow or Nano Banana for the photograph that will sit behind this Facebook post.

HEADLINE: "${headline}"
STORY:
"""${story}"""

Write in natural UK English. Make the image emotionally engaging and ultra-realistic, so someone scrolling immediately feels the human stakes of the headline. Show one concrete editorial scene with one clear subject, believable emotion, natural light, shallow depth of field and a 35mm lens. Use an anonymous person, hands, an object or a place, never a recognisable public figure.

LAYOUT: ${composition}

The image must contain no text, letters, numbers, logos, watermarks or celebrity likeness. It must look like a real press photograph, not an illustration or a smiling stock photo. Write one paragraph of 45 to 70 words, comma separated: subject first, then setting, then light, then camera. End with: "no text, no logos, negative space where the caption sits". Output only that paragraph.`;
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