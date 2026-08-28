# 🛡️ VoiceShield — The VoiceShield Protocol™

**AI voice-clone scam defense.** A 4-step verbal firewall (Establish → Verify → Challenge → Escalate) that protects families and businesses from deepfake audio fraud.

**Live:** https://voiceshield-protocol.vercel.app/
**Buyers' download page:** https://voiceshield-protocol.vercel.app/download.html
**Repo:** https://github.com/getclients4u-lab/voiceshield

---

## 🏗️ Project Architecture

```
voiceshield/
├── index.html            # Sales/landing page (3 buy buttons → Stripe payment link)
├── download.html         # Gated member downloads (email + access code)
├── thank-you.html        # Post-purchase confirmation page
├── product/              # The actual product — 8 PDF deliverables
│   ├── core-guide.pdf            # Main manual (40+ pg, 8 parts)
│   ├── safe-word-builder.pdf     # Worksheet
│   ├── bait-question-scripts.pdf
│   ├── hangup-script.pdf
│   ├── red-flag-checklist.pdf    # 9 signs, fridge printable
│   ├── recovery-playbook.pdf     # 72-hr action plan
│   ├── conversation-guide.pdf    # For parents/grandparents
│   └── business-edition.pdf      # CEO-fraud defense
├── api/
│   ├── webhook.js        # Stripe webhook → buyers.json + auto-register user + email
│   ├── verify.js         # POST {email, code} → grants download access
│   └── admin.js          # Admin: add / revoke / list users
├── buyers.json           # Purchase records (GitHub-hosted DB)
├── users.json            # User registry — access codes stored SHA-256 hashed
├── vsl-video.mp4         # 4-min VSL slideshow
└── launch-emails.md      # 3-email launch sequence
```

---

## 🔗 GitHub Setup

- **Repo:** `getclients4u-lab/voiceshield` (master branch)
- Every push to master **auto-deploys to Vercel** (git integration).
- `buyers.json` / `users.json` are GitHub-hosted JSON "databases" — free,
  versioned, queryable via the GitHub API.

## ▲ Vercel Setup

- **Project:** `voiceshield` — linked to GitHub, production branch `master`
- **Domain:** `voiceshield-protocol.vercel.app` (canonical alias)
- **Env vars (production):**

| Key | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | HMAC verification of Stripe events |
| `GH_TOKEN` | GitHub API (buyers.json / users.json reads+writes) |
| `GH_OWNER` / `GH_REPO` | `getclients4u-lab` / `voiceshield` |
| `AGENTMAIL_API_KEY` | Confirmation emails |
| `VOICESHIELD_MAIL_FROM` | Sender inbox (`gentledesk632@agentmail.to`) |
| `ADMIN_PASSWORD` | Admin API auth |
| `ACCESS_PEPPER` | Salt for access-code hashing |

## 💳 Stripe Setup (test mode)

- **Product:** `prod_V9JBRDj25Xwx4Y` — The VoiceShield Protocol, $27 one-time
- **Price:** `price_1U90ZSLJy1J1wtNpP2h9NHEo`
- **Payment link:** https://buy.stripe.com/test_eVq00kdrq1gL8TJal91Nu0e
  → redirects to `/thank-you.html` after payment
- **Webhook:** `we_1U90ZwLJy1J1wtNp2Oc0r8C2` → `POST /api/webhook`
  (event: `checkout.session.completed`)

## 👥 User Management

Buyers **auto-register** on purchase: the webhook generates a personal
access code (e.g. `VS-FNBFQ-49LG8`), stores it hashed in `users.json`, and
emails it to the buyer. The download page requires email + code.

### Admin API

```
# Add a user (returns their access code):
curl -X POST https://voiceshield-protocol.vercel.app/api/admin \
  -H "Content-Type: application/json" \
  -d '{"password":"<ADMIN_PASSWORD>","action":"add","email":"friend@email.com","name":"Friend"}'

# Revoke access:
curl -X POST .../api/admin -d '{"password":"...","action":"revoke","email":"friend@email.com"}'

# List users:
curl -X POST .../api/admin -d '{"password":"...","action":"list"}'
```

### Verify API (used by the download page)

```
POST /api/verify  {"email":"...","code":"VS-XXXXX-XXXXX"} → {ok:true,name} | 403
```

---

## 🔄 Purchase Flow (end-to-end)

1. Buyer clicks a buy button → Stripe payment link
2. Pays $27 (test mode) → redirected to `/thank-you.html`
3. Stripe fires `checkout.session.completed` → `/api/webhook`
4. Webhook: appends to `buyers.json` + registers user in `users.json`
   (generates hashed access code) + emails buyer their code & download link
5. Buyer opens `/download.html`, enters email + code → downloads all 8 PDFs

**Verified live:** `{received:true, stored:1, registered:1, emailed:true}`

---

## ⚠️ Go-Live Checklist (real money)

- [ ] Replace Stripe keys with **live** (`sk_live_` / `pk_live_`)
- [ ] Recreate product + payment link + webhook in live mode
- [ ] Update buy-button URLs on `index.html`
- [ ] Update `STRIPE_WEBHOOK_SECRET` env var
- [ ] Test a real purchase end-to-end

© 2026 VoiceShield. All rights reserved.
