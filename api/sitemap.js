// api/sitemap.js — The Water and the Word
// Generates sitemap.xml dynamically from Supabase on every request
// Deploy to: api/sitemap.js
// Add to vercel.json rewrites: { "source": "/sitemap.xml", "destination": "/api/sitemap" }

export default async function handler(req, res) {
  const BASE_URL = 'https://thewaterandtheword.com';

  // Fetch all published episodes
  let episodes = [];
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/videos?select=yt_id,title,created_at&order=created_at.desc`, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    });
    if (r.ok) episodes = await r.json();
  } catch (err) {
    console.warn('Sitemap: could not fetch episodes', err.message);
  }

  const today = new Date().toISOString().split('T')[0];

  const staticPages = [
    { loc: `${BASE_URL}/`,         changefreq: 'weekly',  priority: '1.0', lastmod: today },
    { loc: `${BASE_URL}/#about`,   changefreq: 'monthly', priority: '0.6', lastmod: today },
    { loc: `${BASE_URL}/#prayer`,  changefreq: 'monthly', priority: '0.5', lastmod: today },
  ];

  const episodePages = episodes.map(ep => ({
    loc: `${BASE_URL}/?watch=${ep.yt_id}`,
    changefreq: 'monthly',
    priority: '0.8',
    lastmod: ep.created_at ? ep.created_at.split('T')[0] : today,
  }));

  const allPages = [...staticPages, ...episodePages];

  const urlEntries = allPages.map(p => `
  <url>
    <loc>${p.loc}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // cache 1hr
  res.status(200).send(xml);
}
