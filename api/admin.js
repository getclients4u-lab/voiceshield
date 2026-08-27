// Admin: add / revoke / list users for voiceshield product
// POST { password, action: add|revoke|list, email?, name? } → result
import crypto from 'crypto';

export const config = { api: { bodyParser: true } };

const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_OWNER = process.env.GH_OWNER || 'getclients4u-lab';
const GH_REPO = process.env.GH_REPO || 'voiceshield';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PEPPER = process.env.ACCESS_PEPPER || 'voiceshield-pepper';

async function ghGet(path) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
    { headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
  if (!res.ok) return null;
  return res.json();
}

async function ghPut(path, content, sha, message) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${GH_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha }),
  });
  return res.ok;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[crypto.randomInt(chars.length)];
  return `VS-${s.slice(0, 5)}-${s.slice(5)}`;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(`${code}::${PEPPER}`).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { password, action, email, name } = req.body || {};
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const existing = await ghGet('users.json');
  let users = [];
  let sha = existing ? existing.sha : undefined;
  if (existing) {
    try { users = JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8')); } catch (e) {}
    if (!Array.isArray(users)) users = [];
  }

  if (action === 'list') {
    const safe = users.map(u => ({ email: u.email, name: u.name, status: u.status, added: u.added, source: u.source }));
    return res.status(200).json({ ok: true, users: safe });
  }

  if (action === 'add') {
    if (!email) return res.status(400).json({ error: 'email required' });
    const norm = String(email).trim().toLowerCase();
    const existingUser = users.find(u => String(u.email || '').trim().toLowerCase() === norm);
    if (existingUser && existingUser.status === 'active') {
      return res.status(200).json({ ok: true, already: true, email: existingUser.email, name: existingUser.name });
    }
    const code = genCode();
    const user = {
      email: norm,
      name: String(name || '').trim() || norm.split('@')[0],
      codeHash: hashCode(code),
      status: 'active',
      added: new Date().toISOString(),
      source: 'admin',
    };
    if (existingUser) {
      const i = users.findIndex(u => String(u.email || '').trim().toLowerCase() === norm);
      users[i] = user;
    } else {
      users.push(user);
    }
    const saved = await ghPut('users.json', JSON.stringify(users, null, 2), sha, `admin add: ${norm}`);
    return res.status(saved ? 200 : 500).json({ ok: saved, email: norm, code: saved ? code : null });
  }

  if (action === 'revoke') {
    if (!email) return res.status(400).json({ error: 'email required' });
    const norm = String(email).trim().toLowerCase();
    const i = users.findIndex(u => String(u.email || '').trim().toLowerCase() === norm);
    if (i === -1) return res.status(404).json({ ok: false, error: 'user not found' });
    users[i].status = 'disabled';
    users[i].revoked = new Date().toISOString();
    const saved = await ghPut('users.json', JSON.stringify(users, null, 2), sha, `admin revoke: ${norm}`);
    return res.status(saved ? 200 : 500).json({ ok: saved, email: norm, status: 'disabled' });
  }

  return res.status(400).json({ error: 'unknown action' });
}
