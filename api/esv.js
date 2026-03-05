// api/esv.js — The Water and the Word
// Proxies requests to the ESV API so the API key stays server-side.
// Usage: GET /api/esv?ref=John+3:16
//
// Setup:
//   Vercel → Settings → Environment Variables
//   Add: ESV_API_KEY = your key from api.esv.org

export default async function handler(req, res) {
  const { ref } = req.query;
  if (!ref) return res.status(400).json({ error: 'ref required' });

  const key = process.env.ESV_API_KEY;
  if (!key) return res.status(500).json({ error: 'ESV_API_KEY not configured' });

  try {
    const url = new URL('https://api.esv.org/v3/passage/text/');
    url.searchParams.set('q', ref);
    url.searchParams.set('include-headings', 'false');
    url.searchParams.set('include-footnotes', 'false');
    url.searchParams.set('include-verse-numbers', 'false');
    url.searchParams.set('include-short-copyright', 'false');
    url.searchParams.set('include-passage-references', 'false');

    const esvRes = await fetch(url.toString(), {
      headers: { Authorization: `Token ${key}` }
    });

    if (!esvRes.ok) return res.status(502).json({ error: 'ESV API error' });

    const data = await esvRes.json();
    const text = data.passages?.[0]?.trim();
    const canonical = data.canonical || ref;

    if (!text) return res.status(404).json({ error: 'Verse not found' });

    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).json({ verse: text, ref: canonical });

  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
