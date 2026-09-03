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

function tagsPrompt(story, headline) {
  return `Choose exactly five relevant, high-reach Facebook hashtags for this UK news post.

HEADLINE: "${headline}"
STORY:
"""${story}"""

Rules:
- Use the story and headline, not generic unrelated trends.
- Mix one broad current-affairs tag with specific topic tags and, where relevant, a UK or local tag.
- Use plain English and standard hashtag spelling with no spaces inside a tag.
- Do not use #fyp, #viral, #trending or other empty engagement bait unless the story genuinely concerns that topic.
- Output exactly five hashtags separated by single spaces, with no numbering, explanation or punctuation.`;
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
  if (!story || story.length > 20000 || !headline || headline.length > 500) {
    return json(400, { detail: 'A valid story and headline are required.' });
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: tagsPrompt(story, headline) }],
        temperature: 0.5,
        max_tokens: 300
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(502, { detail: data?.error?.message || 'Groq rejected the tag request.' });
    const message = data?.choices?.[0]?.message;
    const tags = (message?.content || data?.choices?.[0]?.text || '').trim();
    if (!tags) return json(502, { detail: 'Groq returned no tags.' });
    return json(200, { tags });
  } catch { return json(502, { detail: 'Could not reach Groq.' }); }
};