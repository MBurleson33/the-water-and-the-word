export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, description, transcript } = req.body;

  if (!title && !description && !transcript) {
    return res.status(400).json({ error: 'Title, description, or transcript required' });
  }

  let contentSection = '';
  if (title)       contentSection += `Title: ${title}\n`;
  if (description) contentSection += `Description: ${description}\n`;
  if (transcript)  contentSection += `\nTranscript:\n${transcript.substring(0, 8000)}\n`;

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
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `You are a tagging assistant for a Christian prophecy video platform called "The Water and the Word".

Analyze the video content below and generate 8-14 highly specific, searchable tags. Focus on:
- Specific books of the Bible mentioned (e.g. "Revelation", "Daniel", "Ezekiel")
- Chapter or passage references (e.g. "Matthew 24", "Daniel 9", "Revelation 6")
- Theological and prophetic concepts (e.g. "Rapture", "Tribulation", "Second Coming")
- Key figures (e.g. "Antichrist", "Holy Spirit", "Jesus", "Israel")
- Themes and topics (e.g. "End Times", "Spiritual Warfare", "Prayer", "Faith")

IMPORTANT: Return ONLY a raw JSON array of strings. No markdown, no backticks, no explanation. Just the array.

${contentSection}

Example output: ["Revelation", "Matthew 24", "End Times", "Israel", "Second Coming", "Tribulation", "Antichrist", "Prophecy"]`
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(500).json({ error: 'Anthropic API error', detail: data });
    }

    // Strip any markdown formatting Claude might have added and parse
    let raw = data.content[0].text.trim();
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    // Extract just the array portion in case there's any surrounding text
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      console.error('No array found in response:', raw);
      return res.status(500).json({ error: 'Could not parse tags from response', raw });
    }

    const tags = JSON.parse(arrayMatch[0]);

    return res.status(200).json({ tags });

  } catch (err) {
    console.error('Tag generation error:', err);
    return res.status(500).json({ error: 'Failed to generate tags', detail: err.message });
  }
}
