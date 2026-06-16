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
| `AGENCYZOOM_API_KEY` | Your AgencyZoom API key (Settings → Integrations in AgencyZoom) |
| `AGENCYZOOM_BASE_URL` | `https://app.agencyzoom.com/api/v1` |
| `NODE_ENV` | `production` |

`DATABASE_URL` is injected automatically by Railway — do **not** set it manually.

### 5 — Run database schema

Once deployed, open the Railway **shell** for your Postgres service and run:

```bash
# In Railway Postgres shell or via psql:
psql $DATABASE_URL -f /app/db/schema.sql
```

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
