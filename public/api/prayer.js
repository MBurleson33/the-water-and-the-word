// api/prayer.js
// Vercel serverless function — receives prayer submissions, saves to Supabase, emails via Resend
//
// Required environment variables (set in Vercel dashboard → Settings → Environment Variables):
//   SUPABASE_URL          — your Supabase project URL
//   SUPABASE_SERVICE_KEY  — your Supabase service_role key (NOT the anon key — this bypasses RLS)
//   RESEND_API_KEY        — your Resend API key (get one free at resend.com)
//   PRAYER_TO_EMAIL       — the email address where you want to receive prayer notifications
//   PRAYER_FROM_EMAIL     — the "from" address (must be a verified domain in Resend, e.g. prayers@thewaterandtheword.com)
//                           If you haven't set up a custom domain yet, use: onboarding@resend.dev (Resend's test address)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, message, yt_id, episode_title } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const submitterName = (name || 'Anonymous').trim();
  const errors = [];

  // ── 1. SAVE TO SUPABASE ───────────────────────────────────────────────────
  try {
    const sbRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/prayers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        name: submitterName,
        message: message.trim(),
        yt_id: yt_id || null,
        episode_title: episode_title || null
      })
    });

    if (!sbRes.ok) {
      const err = await sbRes.text();
      console.error('Supabase error:', err);
      errors.push('Database save failed');
    }
  } catch (err) {
    console.error('Supabase fetch error:', err);
    errors.push('Database unreachable');
  }

  // ── 2. SEND EMAIL VIA RESEND ──────────────────────────────────────────────
  try {
    const source = episode_title
      ? `Episode: <em>${episode_title}</em>`
      : `General Prayer Page`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Georgia, serif; background: #F4F2EE; margin: 0; padding: 0; }
          .wrap { max-width: 600px; margin: 0 auto; padding: 40px 32px; }
          .header { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #5090CF; margin-bottom: 8px; }
          .title { font-size: 28px; font-weight: 300; color: #262D33; margin-bottom: 32px; line-height: 1.3; }
          .meta { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #58697A; margin-bottom: 6px; }
          .prayer-box { border-left: 2px solid #5090CF; padding: 20px 24px; background: #fff; margin: 24px 0; font-size: 18px; color: #474B50; line-height: 1.8; font-style: italic; }
          .from { font-size: 14px; color: #58697A; margin-bottom: 4px; }
          .source { font-size: 13px; color: #5090CF; margin-bottom: 32px; }
          .footer { font-size: 12px; color: #9AA4B0; border-top: 1px solid #DDD9D2; padding-top: 20px; margin-top: 32px; }
          .verse { font-style: italic; color: #58697A; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="header">✦ The Water and the Word</div>
          <div class="title">A New Prayer Request</div>
          <div class="from"><strong>From:</strong> ${submitterName}</div>
          <div class="source"><strong>Via:</strong> ${source}</div>
          <div class="prayer-box">${message.trim().replace(/\n/g, '<br>')}</div>
          <div class="footer">
            <p class="verse">"Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God." — Philippians 4:6</p>
            <p>This request was submitted through <a href="https://thewaterandtheword.com" style="color:#5090CF;">thewaterandtheword.com</a>. View all requests in your <a href="https://thewaterandtheword.com" style="color:#5090CF;">admin panel</a>.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: process.env.PRAYER_FROM_EMAIL || 'onboarding@resend.dev',
        to: [process.env.PRAYER_TO_EMAIL],
        subject: `🕊 New Prayer Request from ${submitterName}`,
        html: emailHtml
      })
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error('Resend error:', err);
      errors.push('Email send failed');
    }
  } catch (err) {
    console.error('Resend fetch error:', err);
    errors.push('Email service unreachable');
  }

  // ── RESPOND ───────────────────────────────────────────────────────────────
  // Even if email fails, if Supabase saved it we consider it a success
  // (prayer isn't lost — admin can still see it in the inbox)
  if (errors.length === 2) {
    // Both failed
    return res.status(500).json({ error: 'Could not save prayer request. Please try again.' });
  }

  return res.status(200).json({
    ok: true,
    warnings: errors.length > 0 ? errors : undefined
  });
}
