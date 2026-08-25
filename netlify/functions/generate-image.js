const GEMINI_MODEL = 'gemini-2.5-flash-image';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { detail: 'POST required.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(500, { detail: 'GEMINI_API_KEY is not configured in Netlify.' });

  let request;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { detail: 'Invalid JSON request.' });
  }

  const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : '';
  const size = typeof request.size === 'string' ? request.size : '1:1';
  const aspectRatio = { '1:1': '1:1', '4:5': '3:4', '3:4': '3:4' }[size];
  if (!prompt || prompt.length > 5000 || !aspectRatio) {
    return json(400, { detail: 'A valid image prompt and size are required.' });
  }

  try {
    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio }
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(502, { detail: data?.error?.message || 'Gemini rejected the image request.' });
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(part => part?.inlineData?.data && part?.inlineData?.mimeType);
    if (!imagePart) return json(502, { detail: 'Gemini returned no image. Try a different prompt.' });
    return json(200, {
      image: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType
    });
  } catch {
    return json(502, { detail: 'Could not reach Gemini.' });
  }
};
