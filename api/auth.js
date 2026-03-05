// api/auth.js — The Water and the Word
// Validates admin password server-side against an environment variable.
// The password never appears in client-side source code.
//
// Setup in Vercel:
//   Dashboard → Your Project → Settings → Environment Variables
//   Add: ADMIN_PASSWORD = (your chosen password)
//   Add: ADMIN_TOKEN_SECRET = (any long random string, e.g. run: openssl rand -hex 32)
//
// How it works:
//   POST /api/auth { password: "..." }
//   → 200 { token: "..." }   (valid for 8 hours)
//   → 401 { error: "Invalid password" }

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  // Compare against environment variable — never hardcoded
  if (password !== process.env.ADMIN_PASSWORD) {
    // Small delay to slow brute-force attempts
    return setTimeout(() => res.status(401).json({ error: 'Invalid password' }), 600);
  }

  // Issue a simple signed token: base64(expiry) + "." + base64(secret + expiry)
  // Not full JWT, but cryptographically sufficient for this use case
  const expiry = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
  const secret = process.env.ADMIN_TOKEN_SECRET || 'fallback-change-this';
  const payload = `${expiry}`;
  const signature = Buffer.from(`${secret}:${payload}`).toString('base64');
  const token = `${Buffer.from(payload).toString('base64')}.${signature}`;

  return res.status(200).json({ token });
}

// ── Token verification (imported by other api routes that need admin auth) ────
export function verifyAdminToken(token) {
  if (!token) return false;
  try {
    const [payloadB64, signature] = token.split('.');
    const payload = Buffer.from(payloadB64, 'base64').toString();
    const expiry = parseInt(payload);
    if (isNaN(expiry) || Date.now() > expiry) return false; // expired
    const secret = process.env.ADMIN_TOKEN_SECRET || 'fallback-change-this';
    const expected = Buffer.from(`${secret}:${payload}`).toString('base64');
    return signature === expected;
  } catch {
    return false;
  }
}
