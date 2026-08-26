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

function captionPrompt(story, headline, format) {
  const nowThenRules = format === 'now-then' ? `
- This is a "Now and Then" comparison. Write warmly about the contrast between modern life and the older British way suggested by the headline.
- For this format, override the general length: write 120 to 200 words in 3 to 5 short paragraphs.
- Include a believable, relatable memory-style moment for a UK reader aged 40 or over, but do not invent specific facts about the news story.
- End with a natural invitation to comment by choosing YES or NO, followed by 3 to 5 relevant UK nostalgia hashtags.` : '';
  return `Write a long Facebook post description based only on this news story and headline.

STORY:
"""${story}"""

HEADLINE: "${headline}"

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
${nowThenRules}

Output only the finished description.`;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { detail: 'POST required.' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return json(500, { detail: 'GROQ_API_KEY is not configured in Netlify.' });

  let request;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { detail: 'Invalid JSON request.' });
  }

  const story = typeof request.story === 'string' ? request.story.trim() : '';
  const headline = typeof request.headline === 'string' ? request.headline.trim() : '';
  const format = request.format === 'now-then' ? 'now-then' : 'standard';
  if (!story || story.length > 20000 || !headline || headline.length > 500) {
    return json(400, { detail: 'A valid story and headline are required.' });
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: captionPrompt(story, headline, format) }],
        temperature: 0.8,
        max_tokens: 1400
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(502, { detail: data?.error?.message || 'Groq rejected the request.' });
    }

    const description = data?.choices?.[0]?.message?.content?.trim();
    if (!description) return json(502, { detail: 'Groq returned an empty description.' });
    return json(200, { description });
  } catch {
    return json(502, { detail: 'Could not reach Groq.' });
  }
};
