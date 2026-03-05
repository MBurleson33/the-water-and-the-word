// api/auth/verify.js — The Water and the Word
// Verifies an existing admin token is still valid.
// Called on page load to restore admin session without re-entering password.

import { verifyAdminToken } from '../auth.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { token } = req.body;
  if (verifyAdminToken(token)) {
    return res.status(200).json({ valid: true });
  }
  return res.status(401).json({ valid: false });
}
