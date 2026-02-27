export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, description } = req.body;

  if (!title && !description) {
    return res.status(400).json({ error: 'Title or description required' });
  }

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

Given this video title and description, generate a list of 8-12 relevant tags. Tags should be specific, searchable keywords related to the content — things like scripture references, theological concepts, prophetic topics, named books of the Bible, key figures, and themes.

Return ONLY a JSON array of tag strings. No explanation, no markdown, just the raw JSON array.

Title: ${title || ''}
Description: ${description || ''}

Example output format: ["Revelation", "End Times", "Israel", "Matthew 24", "Second Coming", "Prophecy", "Tribulation", "Holy Spirit"]`
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(500).json({ error: 'Anthropic API error', detail: data });
    }

    // Parse the tag array from Claude's response
    const raw = data.content[0].text.trim();
    const tags = JSON.parse(raw);

    return res.status(200).json({ tags });

  } catch (err) {
    console.error('Tag generation error:', err);
    return res.status(500).json({ error: 'Failed to generate tags', detail: err.message });
  }
}
