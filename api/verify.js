// Verify a user's access code against users.json (voiceshield)
// POST { email, code } → { ok:true, name } or 403
import crypto from 'crypto';

export const config = { api: { bodyParser: true } };

const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_OWNER = process.env.GH_OWNER || 'getclients4u-lab';
const GH_REPO = process.env.GH_DATA_REPO || 'voiceshield-data';
const PEPPER = process.env.ACCESS_PEPPER || 'voiceshield-pepper';

async function ghGet(path) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
    { headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
  if (!res.ok) return null;
  return res.json();
}

function hashCode(code) {
  return crypto.createHash('sha256').update(`${code}::${PEPPER}`).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'email and code required' });

  const existing = await ghGet('users.json');
  if (!existing) return res.status(500).json({ error: 'users db unavailable' });
  let users = [];
  try { users = JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8')); } catch (e) {}
  if (!Array.isArray(users)) users = [];

  const norm = String(email).trim().toLowerCase();
  const user = users.find(u => String(u.email || '').trim().toLowerCase() === norm);
  if (!user) return res.status(403).json({ ok: false, error: 'no account for this email' });
  if (user.status !== 'active') return res.status(403).json({ ok: false, error: 'account disabled' });
  if (user.codeHash !== hashCode(String(code).trim())) {
    return res.status(403).json({ ok: false, error: 'invalid code' });
  }
  return res.status(200).json({ ok: true, name: user.name || '', email: user.email, since: user.added });
}
