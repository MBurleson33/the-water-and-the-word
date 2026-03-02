// api/tag.js — The Water and the Word v2
// Key improvements: existing tag awareness, smart transcript sampling, better prompt

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, description, transcript, category } = req.body;
  if (!title && !description && !transcript) {
    return res.status(400).json({ error: 'Title, description, or transcript required' });
  }

  // 1. Fetch existing tag vocabulary — so Claude reuses "The Rapture" 
  //    instead of generating "Rapture", "rapture", "The Rapture Event"
  let existingTags = [];
  try {
    const sbRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/videos?select=tags`, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    });
    if (sbRes.ok) {
      const rows = await sbRes.json();
      const tagSet = new Set();
      rows.forEach(row => {
        if (Array.isArray(row.tags)) row.tags.forEach(t => tagSet.add(t));
      });
      existingTags = [...tagSet].sort();
    }
  } catch (err) {
    console.warn('Could not fetch existing tags:', err.message);
  }

  // 2. Smart transcript sampling — beginning + middle + end
  //    v1 only took the first 8000 chars, missing theological depth in the middle/end
  function sampleTranscript(text, maxChars = 9000) {
    if (!text || text.length <= maxChars) return text;
    const third = Math.floor(maxChars / 3);
    const mid = Math.floor(text.length / 2);
    return text.substring(0, third)
      + '\n\n[...]\n\n'
      + text.substring(mid - Math.floor(third / 2), mid + Math.floor(third / 2))
      + '\n\n[...]\n\n'
      + text.substring(text.length - third);
  }

  let contentSection = '';
  if (title)       contentSection += `Title: ${title}\n`;
  if (category)    contentSection += `Series/Category: ${category}\n`;
  if (description) contentSection += `Description: ${description}\n`;
  if (transcript)  contentSection += `\nTranscript (sampled):\n${sampleTranscript(transcript)}\n`;

  const existingTagsSection = existingTags.length > 0
    ? `\nEXISTING TAGS IN LIBRARY (use exact forms, never invent variants):\n${existingTags.join(', ')}\n`
    : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `You are a tagging assistant for "The Water and the Word" — a Christian prophecy platform focused on biblical eschatology, end-times study, and Spirit-led testimony.

Generate 8-14 highly specific, searchable tags in this priority order:
1. Scripture references — be precise: "Revelation 13", "Daniel 7", "Matthew 24", "Ezekiel 38-39", "1 Thessalonians 4:17"
2. Prophetic concepts — "The Rapture", "The Tribulation", "The Antichrist", "Mark of the Beast", "Second Coming", "Millennium"
3. Key figures/entities — "Israel", "The Remnant", "The Holy Spirit", "The False Prophet", "Gog and Magog"
4. Themes — "End Times", "Spiritual Warfare", "Repentance", "Salvation", "Faith", "Prophecy"

RULES:
- Specific beats general: "Revelation 6" > "Revelation" > "Prophecy"
- Use existing library tag forms exactly — never invent variants
- No near-duplicates ("End Times" and "End-Times" must not both appear)
- Only tag what actually appears in the content
- Scripture format: "Book Chapter" or "Book Chapter:Verse"
${existingTagsSection}
CONTENT:
${contentSection}

Return ONLY a raw JSON array. No markdown, no backticks, no explanation.
Example: ["Revelation 13", "Daniel 7", "The Antichrist", "Mark of the Beast", "The Tribulation", "Israel", "End Times", "Prophecy"]`
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(500).json({ error: 'Anthropic API error', detail: data });
    }

    let raw = data.content[0].text.trim();
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      return res.status(500).json({ error: 'Could not parse tags', raw });
    }

    let tags = JSON.parse(arrayMatch[0]);

    // Sort: scripture refs (contain digits) first, then alphabetical
    tags = tags
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim())
      .sort((a, b) => {
        const aNum = /\d/.test(a), bNum = /\d/.test(b);
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return a.localeCompare(b);
      });

    return res.status(200).json({ tags });

  } catch (err) {
    console.error('Tag generation error:', err);
    return res.status(500).json({ error: 'Failed to generate tags', detail: err.message });
  }
}
