// api/tag.js — The Water and the Word v3
// Built from v2 base with timestamp support added
// Returns [{tag, start}] always — start is null when no timecodes present

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, description, transcript, category } = req.body;
  if (!title && !description && !transcript) {
    return res.status(400).json({ error: 'Title, description, or transcript required' });
  }

  // Detect timecodes — supports "0:08", "1:23:45", "[0:08]", "00:08"
  const TIMECODE_RE = /(?:\[)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\])?/;
  const hasTimecodes = transcript ? TIMECODE_RE.test(transcript) : false;

  // Fetch existing tag vocabulary so Claude reuses consistent names
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
        if (Array.isArray(row.tags)) row.tags.forEach(t => {
          const label = typeof t === 'string' ? t : (t && t.tag);
          if (label) tagSet.add(label);
        });
      });
      existingTags = [...tagSet].sort();
    }
  } catch (err) {
    console.warn('Could not fetch existing tags:', err.message);
  }

  // Smart transcript sampling: beginning + middle + end
  // Avoids missing theological depth that often appears mid-video or at the end
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
  if (transcript)  contentSection += `\nTranscript:\n${sampleTranscript(transcript)}\n`;

  const existingTagsSection = existingTags.length > 0
    ? `\nEXISTING TAGS IN LIBRARY (use exact forms — never invent variants):\n${existingTags.join(', ')}\n`
    : '';

  const timecodeInstructions = hasTimecodes
    ? `
The transcript contains timecodes. For each tag, find the timestamp where that topic BEGINS to be meaningfully discussed (not just briefly mentioned).
Return a JSON array of objects: [{"tag": "Tag Name", "start": <seconds as integer>}, ...]
Convert timecodes to seconds: "0:08" = 8, "1:23" = 83, "1:23:45" = 5025
If a tag has no clear timestamp, set start to null.
Example: [{"tag": "Revelation 13", "start": 145}, {"tag": "Mark of the Beast", "start": 312}, {"tag": "End Times", "start": null}]`
    : `Return ONLY a raw JSON array of strings. No markdown, no backticks, no explanation.
Example: ["Revelation 13", "Daniel 7", "The Antichrist", "Mark of the Beast", "The Tribulation", "Israel", "End Times", "Prophecy"]`;

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
1. Scripture references — precise: "Revelation 13", "Daniel 7", "Matthew 24", "Ezekiel 38-39", "1 Thessalonians 4:17"
2. Prophetic concepts — "The Rapture", "The Tribulation", "The Antichrist", "Mark of the Beast", "Second Coming", "The Millennium"
3. Key figures/entities — "Israel", "The Remnant", "The Holy Spirit", "The False Prophet", "Gog and Magog"
4. Themes — "End Times", "Spiritual Warfare", "Repentance", "Salvation", "Faith", "Prophecy", "Bible Study"

RULES:
- Specific beats general: "Revelation 6" > "Revelation" > "Prophecy"
- Use existing library tag forms exactly — never invent variants
- No near-duplicates ("End Times" and "End-Times" must not both appear)
- Only tag what actually appears in the content
- Scripture format: "Book Chapter" or "Book Chapter:Verse"
${existingTagsSection}
CONTENT:
${contentSection}
${timecodeInstructions}`
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

    // Normalize to [{tag, start}] format always
    tags = tags
      .map(t => typeof t === 'string'
        ? { tag: t.trim(), start: null }
        : { tag: (t.tag || '').trim(), start: t.start ?? null })
      .filter(t => t.tag.length > 0);

    // Deduplicate
    const seen = new Set();
    tags = tags.filter(t => {
      const k = t.tag.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    // Sort: scripture refs (contain digits) first, then alphabetical
    tags.sort((a, b) => {
      const an = /\d/.test(a.tag), bn = /\d/.test(b.tag);
      if (an && !bn) return -1; if (!an && bn) return 1;
      return a.tag.localeCompare(b.tag);
    });

    return res.status(200).json({ tags, hasTimecodes });

  } catch (err) {
    console.error('Tag generation error:', err);
    return res.status(500).json({ error: 'Failed to generate tags', detail: err.message });
  }
}
