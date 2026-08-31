// Authenticated product download — streams PDFs from the PRIVATE data repo
// POST { email, code, file } → PDF binary (after verification) or error
import crypto from 'crypto';

export const config = { api: { bodyParser: true } };

const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_OWNER = process.env.GH_OWNER || 'getclients4u-lab';
const DATA_REPO = process.env.GH_DATA_REPO || 'voiceshield-data';
const PEPPER = process.env.ACCESS_PEPPER || 'voiceshield-pepper';

const ALLOWED = [
  'core-guide.pdf', 'safe-word-builder.pdf', 'bait-question-scripts.pdf',
  'hangup-script.pdf', 'red-flag-checklist.pdf', 'recovery-playbook.pdf',
  'conversation-guide.pdf', 'business-edition.pdf',
];

function hashCode(code) {
  return crypto.createHash('sha256').update(`${code}::${PEPPER}`).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { email, code, file } = req.body || {};
  if (!email || !code || !file) return res.status(400).json({ error: 'email, code and file required' });
  if (!ALLOWED.includes(file)) return res.status(400).json({ error: 'unknown file' });

  // 1. Verify access code against users.json (private repo)
  let users = [];
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${DATA_REPO}/contents/users.json`,
      { headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
    if (r.ok) {
      const d = await r.json();
      users = JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'));
      if (!Array.isArray(users)) users = [];
    }
  } catch (e) { return res.status(500).json({ error: 'user db unavailable' }); }

  const norm = String(email).trim().toLowerCase();
  const user = users.find(u => String(u.email || '').trim().toLowerCase() === norm);
  if (!user) return res.status(403).json({ error: 'no account for this email' });
  if (user.status !== 'active') return res.status(403).json({ error: 'account disabled' });
  if (user.codeHash !== hashCode(String(code).trim())) return res.status(403).json({ error: 'invalid code' });

  // 2. Stream the PDF from the private repo
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${DATA_REPO}/contents/product/${file}`,
      { headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
    if (!r.ok) return res.status(404).json({ error: 'file not found' });
    const d = await r.json();
    const buf = Buffer.from(d.content, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).json({ error: 'download failed' });
  }
}
