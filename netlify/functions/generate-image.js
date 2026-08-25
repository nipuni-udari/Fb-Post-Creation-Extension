const CLOUDFLARE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

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

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    return json(500, { detail: 'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be configured in Netlify.' });
  }

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
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${CLOUDFLARE_MODEL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`
      },
      body: JSON.stringify({
        prompt,
        num_steps: 8,
        width: aspectRatio === '1:1' ? 1024 : 896,
        height: aspectRatio === '1:1' ? 1024 : 1152
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(502, { detail: data?.errors?.[0]?.message || data?.message || 'Cloudflare rejected the image request.' });
    }

    const image = data?.result?.image;
    if (!image) return json(502, { detail: 'Cloudflare returned no image. Try a different prompt.' });
    return json(200, { image, mimeType: 'image/png' });
  } catch {
    return json(502, { detail: 'Could not reach Cloudflare Workers AI.' });
  }
};
