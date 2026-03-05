// api/scripture.js — The Water and the Word
// Picks a daily verse using Claude, fetches real text from ESV API.
// Everything server-side — no API keys exposed to the browser.
//
// Required Vercel environment variables:
//   ANTHROPIC_API_KEY  — your Anthropic API key
//   ESV_API_KEY        — your ESV API key from api.esv.org
//
// Usage: GET /api/scripture
// Returns: { verse, ref, date }
// Responds with the same verse all day (keyed by date server-side via Cache-Control)

export default async function handler(req, res) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // ── Step 1: Ask Claude for a verse reference ────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  let ref = '';
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 30,
        system: 'You are a scripture selector for a Christian prophecy ministry. Given a date, return ONLY a single Bible verse reference — nothing else. No explanation, no quotes, no punctuation. Just the reference like: John 3:16 or Psalm 46:10 or Isaiah 40:31. Choose something meaningful and uplifting.',
        messages: [{ role: 'user', content: 'Pick one Bible verse reference for ' + today }]
      })
    });

    if (!aiRes.ok) return res.status(502).json({ error: 'Claude API error' });
    const aiData = await aiRes.json();
    ref = aiData.content?.[0]?.text?.trim() || '';
  } catch (err) {
    return res.status(502).json({ error: 'Claude request failed' });
  }

  if (!ref) return res.status(500).json({ error: 'No reference returned' });

  // ── Step 2: Fetch real verse text from ESV API ──────────────────────────────
  const esvKey = process.env.ESV_API_KEY;
  if (!esvKey) return res.status(500).json({ error: 'ESV_API_KEY not configured' });

  try {
    const url = new URL('https://api.esv.org/v3/passage/text/');
    url.searchParams.set('q', ref);
    url.searchParams.set('include-headings', 'false');
    url.searchParams.set('include-footnotes', 'false');
    url.searchParams.set('include-verse-numbers', 'false');
    url.searchParams.set('include-short-copyright', 'false');
    url.searchParams.set('include-passage-references', 'false');

    const esvRes = await fetch(url.toString(), {
      headers: { Authorization: `Token ${esvKey}` }
    });

    if (!esvRes.ok) return res.status(502).json({ error: 'ESV API error' });

    const data = await esvRes.json();
    const verse = data.passages?.[0]?.trim().replace(/\n+/g, ' ');
    const canonical = data.canonical || ref;

    if (!verse) return res.status(404).json({ error: 'Verse not found' });

    // Cache for the rest of the day on Vercel's CDN
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    const secondsUntilMidnight = Math.floor((midnight - now) / 1000);

    res.setHeader('Cache-Control', `public, max-age=${secondsUntilMidnight}, s-maxage=${secondsUntilMidnight}`);
    return res.status(200).json({ verse, ref: canonical, date: today });

  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
