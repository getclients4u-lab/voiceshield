// Vercel serverless webhook for Stripe payment events (voiceshield)
// ESM only. bodyParser:false REQUIRED (Vercel's JSON parsing breaks Stripe HMAC).
// Pattern proven on dopamine-reset + habitbloom.
import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

const WH_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_OWNER = process.env.GH_OWNER || 'getclients4u-lab';
const GH_REPO = process.env.GH_REPO || 'voiceshield';
const MAIL_FROM = process.env.VOICESHIELD_MAIL_FROM || 'gentledesk632@agentmail.to';
const AGENTMAIL_KEY = process.env.AGENTMAIL_API_KEY || '';
const BUYERS_FILE = 'buyers.json';

// Read raw request body as a Buffer (so HMAC over raw bytes works)
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripe(payloadBuf, sigHeader) {
  if (!WH_SECRET || !sigHeader) return false;
  try {
    const parts = {};
    sigHeader.split(',').forEach(p => { const [k, ...v] = p.split('='); parts[k] = v.join('='); });
    const ts = parts['t'], sig = parts['v1'];
    if (!ts || !sig) return false;
    const expected = crypto.createHmac('sha256', WH_SECRET).update(`${ts}.${payloadBuf}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch (e) { return false; }
}

async function ghGet(path) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
    { headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GH GET ' + res.status);
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

async function addToAllowList(email) {
  try {
    await fetch('https://api.agentmail.to/v0/lists/send/allow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENTMAIL_KEY}` },
      body: JSON.stringify({ entry: email }),
    });
  } catch (e) { /* best effort */ }
}

async function sendEmail(buyer) {
  if (!AGENTMAIL_KEY || !MAIL_FROM) return false;
  await addToAllowList(buyer.email);
  const body =
`You're Protected! The VoiceShield Protocol™ — access inside ✅

Hi ${buyer.name || 'there'},

Thank you! Your order is confirmed.

DOWNLOAD YOUR SYSTEM:
→ https://voiceshield-protocol.vercel.app/download.html

WHAT'S INSIDE (8 deliverables):
• The VoiceShield Protocol™ Core Guide (40+ pages)
• Family Safe-Word Builder
• 3 "Bait Question" Scripts
• The Hang-Up Script
• Voice-Clone Red-Flag Checklist (9 signs)
• "I Already Sent Money" Recovery Playbook (72-hr)
• Parent & Grandparent Conversation Guide

START TONIGHT:
1. Pick a family safe word (never share it over the phone!)
2. Print the Red-Flag Checklist
3. Run one practice challenge with your family

30-day, no-questions-asked "Sleep Easy" guarantee — keep everything either way.

Sleep easy. Your family is protected.
— The VoiceShield Team`;
  const res = await fetch(`https://api.agentmail.to/v0/inboxes/${MAIL_FROM}/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENTMAIL_KEY}` },
    body: JSON.stringify({ to: [buyer.email], subject: "You're Protected! The VoiceShield Protocol™", text: body }),
  });
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const raw = await readRawBody(req);
  const sig = req.headers['stripe-signature'] || '';
  if (!verifyStripe(raw, sig)) return res.status(400).json({ error: 'invalid signature' });

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'bad json' }); }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const buyer = {
      id: s.id,
      email: (s.customer_details && s.customer_details.email) || s.customer_email || '',
      name: (s.customer_details && s.customer_details.name) || '',
      amount: (s.amount_total || 0) / 100,
      currency: s.currency || 'usd',
      product: 'voiceshield',
      ts: new Date().toISOString(),
    };
    if (!buyer.email) return res.status(200).json({ received: true, error: 'no email' });

    let buyers = [];
    let stored = false, emailed = false;
    try {
      const existing = await ghGet(BUYERS_FILE);
      if (existing) {
        try { buyers = JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8')); } catch (e) { buyers = []; }
        if (!Array.isArray(buyers)) buyers = [];
      }
      buyers.push(buyer);
      stored = await ghPut(BUYERS_FILE, JSON.stringify(buyers, null, 2), existing ? existing.sha : undefined,
        `buyer: ${buyer.email}`);
    } catch (e) { stored = false; }

    emailed = await sendEmail(buyer);
    return res.status(200).json({ received: true, stored: stored ? 1 : 0, emailed });
  }
  return res.status(200).json({ received: true, ignored: event.type });
}
