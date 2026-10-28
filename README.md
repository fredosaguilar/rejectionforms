# Columbia Basin Insurance — E&O Forms Portal

Bilingual (EN/ES) E&O forms and coverage recommendation forms with AgencyZoom integration.
Deployed on Railway with Postgres persistence.

---

## Features

- **5 forms**: Vehicle Removal E&O, Auto, Home, Trucking, Contractor coverage recommendations
- **AgencyZoom integration**: search clients, pre-fill from policies, auto-post note on submission
- **Agent authentication**: email + password login, admin panel to manage agents
- **Submission history**: every form saved to Postgres with full JSON payload + signatures
- **Bilingual**: English / Spanish throughout

---

## Deploy to Railway (step-by-step)

### 1 — Push to GitHub

```bash
cd eo-forms-app
git init
git add .
git commit -m "Initial commit"
# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_ORG/eo-forms.git
git push -u origin main
```

### 2 — Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select your repo
3. Railway auto-detects the Dockerfile and starts building

### 3 — Add Postgres

In your Railway project dashboard:
1. Click **+ New** → **Database** → **PostgreSQL**
2. Railway automatically injects `DATABASE_URL` into your service — no manual config needed

### 4 — Set environment variables

In Railway → your service → **Variables**, add:

| Variable | Value |
|---|---|
| `SESSION_SECRET` | Run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` and paste result |
| `AGENCYZOOM_API_KEY` | A bearer token for AgencyZoom, if your account has one. **Or** set `AGENCYZOOM_USERNAME` and `AGENCYZOOM_PASSWORD` instead and the portal will log in for a token. |
| `AGENCYZOOM_BASE_URL` | Optional; defaults to `https://api.agencyzoom.com`. Set it if your account is on a different host. |

AgencyZoom is reachable at `GET /api/az/search?q=…` and `GET /api/az/status`,
which reports whether it is answering and why not. Nothing in the portal calls
it today: the Payments tab fills a fee request from the signed fee agreements
on file instead, which are the only source that carries the agreed amount.
| `NODE_ENV` | `production` |

For the broker fee payment portal, add these as well. Without them the Payments
tab still creates and sends fee requests and records a fee paid in the office;
it simply cannot take a card.

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | From Stripe → Developers → API keys. Start with the **test** key (`sk_test_…`) and pay a request with card `4242 4242 4242 4242` before switching to `sk_live_…`. |
| `STRIPE_WEBHOOK_SECRET` | From Stripe → Developers → Webhooks. Add an endpoint at `https://<your-app>/api/pay/webhook` subscribed to `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed` and `charge.refunded`, then copy its signing secret (`whsec_…`). |
| `AGENCY_TZ` | Optional. The time zone receipts are dated in; defaults to `America/Los_Angeles`. |

The webhook matters most for bank transfers, which settle days after the client
leaves the page. A card payment is confirmed when they return either way.

To take bank transfers at all, turn on **ACH Direct Debit** in Stripe →
Settings → Payment methods.

On the same page, turn **Link** off. Link is Stripe's own wallet; while it is
on, the card page offers to save the card against a phone number and texts a
code, which nobody can complete while standing at the counter. It cannot be
switched off from this application — Stripe shows it whenever the account
allows it — so the Payments tab reports whether it is on and links to the
setting.

`DATABASE_URL` is injected automatically by Railway — do **not** set it manually.

### 5 — Run database schema

Once deployed, open the Railway **shell** for your Postgres service and run:

```bash
# In Railway Postgres shell or via psql:
psql $DATABASE_URL -f /app/db/schema.sql
```

The e-signature and payment tables are created automatically on every boot, so
`db/esign.sql` and `db/payments.sql` need no manual step.

Or connect locally:
```bash
railway connect postgres
\i db/schema.sql
```

### 6 — Create your first admin account

After running the schema, the default admin is:
- **Email**: `admin@columbibasinins.com`  
- **Password**: You need to set a real one — connect to Postgres and run:

```sql
UPDATE agents 
SET password_hash = '$2a$12$...'   -- generate with bcrypt
WHERE email = 'admin@columbibasinins.com';
```

Or easier: use the Node REPL locally:
```bash
node -e "const b=require('bcryptjs'); b.hash('YourPassword123!',12).then(h=>console.log(h))"
```
Paste that hash into the UPDATE above.

Then log in at `https://your-app.railway.app/login` and go to `/admin/agents` to add all your agents.

---

## Local development

```bash
cp .env.example .env
# Edit .env with your local Postgres URL and AgencyZoom key

npm install
node db/schema.sql   # or: psql $DATABASE_URL -f db/schema.sql
npm run dev          # starts with nodemon on port 3000
```

---

## AgencyZoom API notes

The integration uses these endpoints:
- `GET /contacts?search=` — client search
- `GET /contacts/:id` — contact detail
- `GET /contacts/:id/policies` — policies for prefill
- `POST /contacts/:id/notes` — post form summary note

If AgencyZoom changes their API schema, update the field mappings in `services/agencyzoom.js`. The normalization layer handles common field name variations.

---

## Project structure

```
eo-forms-app/
├── server.js              # Express app entry point
├── Dockerfile             # Railway build
├── railway.toml           # Railway config
├── db/
│   ├── index.js           # Postgres pool
│   └── schema.sql         # Table definitions
├── middleware/
│   └── auth.js            # requireAuth / requireAdmin
├── routes/
│   ├── auth.js            # Login, logout, agent management
│   ├── agencyzoom.js      # AZ search + contact proxy
│   └── forms.js           # Submit + history API
├── services/
│   └── agencyzoom.js      # AgencyZoom API client
└── public/
    └── index.html         # Full forms frontend (single page)
```
