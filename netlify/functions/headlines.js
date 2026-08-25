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

function prompt(story) {
  return `Read this news story and write four headlines for a Facebook image post.

STORY:
"""${story}"""

AUDIENCE: Thoughtful adults in Britain, especially people who care about fairness, household costs, public money, rules and having a proper say.

RULES
- Write in natural UK English with British spelling and phrasing.
- Use 4 to 14 words per headline, with short punchy words and no jargon.
- Make each headline readable at a glance in large capital letters.
- Do not invent anything that is not in the story.
- Give four genuinely different angles: a direct yes/no question, a blunt statement of the unfair or absurd point, a conversational neighbourly line, and a dry wry line.

Output exactly four lines, one headline per line, with no numbers, bullets, labels or commentary.`;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { detail: 'POST required.' });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return json(500, { detail: 'GROQ_API_KEY is not configured in Netlify.' });

  let request;
  try { request = JSON.parse(event.body || '{}'); } catch { return json(400, { detail: 'Invalid JSON request.' }); }
  const story = typeof request.story === 'string' ? request.story.trim() : '';
  if (!story || story.length > 20000) return json(400, { detail: 'A valid story is required.' });

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt(story) }],
        temperature: 0.8,
        max_tokens: 180
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(502, { detail: data?.error?.message || 'Groq rejected the headline request.' });
    const result = data?.choices?.[0]?.message?.content?.trim();
    if (!result) return json(502, { detail: 'Groq returned empty headlines.' });
    return json(200, { headlines: result });
  } catch { return json(502, { detail: 'Could not reach Groq.' }); }
};
