// api/og.js — The Water and the Word
// Generates a dynamic branded OG share image per episode
// Usage: /api/og?title=Episode+Title&cat=Series+Name&ytid=YOUTUBE_ID
//
// Returns a 1200×630 SVG image — correct size for all major platforms
// (Facebook, Twitter/X, iMessage, Slack, WhatsApp)

export default function handler(req, res) {
  const { title = '', cat = '', ytid = '' } = req.query;

  // Sanitize inputs — strip XML special chars
  const safe = str => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .substring(0, 120);

  const safeTitle = safe(title);
  const safeCat   = safe(cat).toUpperCase();

  // Wrap title text — break at word boundaries to fit within 1100px
  // Approximate: Cormorant Garamond at 64px ≈ 34px per char
  function wrapText(text, maxChars = 32) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxChars) {
        if (current) lines.push(current.trim());
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) lines.push(current.trim());
    return lines.slice(0, 3); // max 3 lines
  }

  const titleLines = wrapText(safeTitle, 30);
  const lineHeight = 80;
  const titleStartY = titleLines.length === 1 ? 310 : titleLines.length === 2 ? 270 : 235;

  const titleSvg = titleLines.map((line, i) =>
    `<text x="80" y="${titleStartY + i * lineHeight}" 
      font-family="Georgia, serif" font-size="64" font-weight="400"
      fill="#F4F2EE" letter-spacing="0.01em">${line}</text>`
  ).join('\n    ');

  // YouTube thumbnail as background (blurred/darkened via filter)
  const thumbUrl = ytid
    ? `https://i.ytimg.com/vi/${ytid}/maxresdefault.jpg`
    : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <filter id="blur">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
    <!-- Dark gradient overlay -->
    <linearGradient id="overlay" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1A1814" stop-opacity="0.97"/>
      <stop offset="55%" stop-color="#1A1814" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="#1A1814" stop-opacity="0.55"/>
    </linearGradient>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1A1814" stop-opacity="0"/>
      <stop offset="100%" stop-color="#1A1814" stop-opacity="0.6"/>
    </linearGradient>
  </defs>

  <!-- Background: YouTube thumbnail (blurred) if available, else solid dark -->
  <rect width="1200" height="630" fill="#1A1814"/>
  ${thumbUrl ? `<image href="${thumbUrl}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" filter="url(#blur)" opacity="0.45"/>` : ''}

  <!-- Dark overlay for text legibility -->
  <rect width="1200" height="630" fill="url(#overlay)"/>
  <rect width="1200" height="630" fill="url(#bottomFade)"/>

  <!-- Gold top accent line -->
  <rect x="80" y="60" width="64" height="3" fill="#B8965A"/>

  <!-- Category label -->
  ${safeCat ? `<text x="80" y="110"
    font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="400"
    fill="#B8965A" letter-spacing="0.22em">${safeCat}</text>` : ''}

  <!-- Episode title -->
  ${titleSvg}

  <!-- Tagline -->
  <text x="80" y="${titleStartY + titleLines.length * lineHeight + 40}"
    font-family="Georgia, serif" font-size="22" font-style="italic" font-weight="300"
    fill="rgba(244,242,238,0.55)" letter-spacing="0.03em">Where the Spirit Leads, We Bear Witness.</text>

  <!-- Bottom divider + site name -->
  <rect x="80" y="570" width="1040" height="1" fill="rgba(244,242,238,0.15)"/>
  <text x="80" y="605"
    font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="400"
    fill="rgba(244,242,238,0.45)" letter-spacing="0.18em">THEWATERANDTHEWORD.COM</text>

  <!-- Right: play icon circle (subtle) -->
  <circle cx="1100" cy="315" r="52" fill="rgba(46,111,181,0.25)" stroke="rgba(46,111,181,0.5)" stroke-width="1.5"/>
  <polygon points="1088,295 1088,335 1120,315" fill="rgba(244,242,238,0.7)"/>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // cache 24hrs
  res.status(200).send(svg);
}
