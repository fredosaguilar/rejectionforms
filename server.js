require('dotenv').config();
const express        = require('express');
const session        = require('express-session');
const helmet         = require('helmet');
const morgan         = require('morgan');
const path           = require('path');
const crypto         = require('crypto');
const db             = require('./db');

const authRoutes     = require('./routes/auth');
const formRoutes     = require('./routes/forms');
const esign          = require('./routes/esign');
const { requireAuth } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.set('trust proxy', 1);

// Use Postgres session store in production to survive container restarts
const pgSession = require('connect-pg-simple')(session);
const sessionStore = new pgSession({
  pool: db.pool,
  tableName: 'session',
  createTableIfMissing: true,
  pruneSessionInterval: 60 * 60,
});

app.use(session({
  store:             sessionStore,
  secret:            process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   true,
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000,
    sameSite: 'none',
  },
}));

app.use('/', authRoutes);

app.get('/api/me', (req, res) => {
  if (!req.session?.agentId) return res.status(401).json({ error: 'not logged in' });
  res.json({
    agentId:   req.session.agentId,
    agentName: req.session.agentName,
    email:     req.session.email,
    role:      req.session.role,
  });
});

app.use('/api/forms', formRoutes);
app.use('/api/esign', esign.router);
// The signing ceremony is reached by token, not by login, so it sits outside requireAuth.
app.use('/api/sign', esign.pub);

// A transcript login code works like an OAuth authorization code: it is
// random, short-lived, single-use, and only its SHA-256 hash is stored. The
// transcript service exchanges it server-to-server, so agents never need a
// second password and neither application has to share its session secret.
app.post('/api/sso/transcripts/exchange', async (req, res) => {
  try {
    const hash = crypto.createHash('sha256').update(String(req.body.code || '')).digest('hex');
    const { rows } = await db.query(
      `UPDATE portal_sso_codes
          SET used_at = NOW()
        WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        RETURNING agent_id, agent_name, email, role`, [hash]);
    if (!rows[0]) return res.status(401).json({ error: 'Invalid or expired login code' });
    res.json({ success: true, user: rows[0] });
  } catch (e) {
    console.error('transcript SSO exchange:', e);
    res.status(500).json({ error: 'Could not complete sign-in' });
  }
});

app.get('/transcripts', requireAuth, async (req, res) => {
  try {
    const code = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    await db.query('DELETE FROM portal_sso_codes WHERE expires_at < NOW() OR used_at IS NOT NULL');
    await db.query(
      `INSERT INTO portal_sso_codes (code_hash, agent_id, agent_name, email, role, expires_at)
       VALUES ($1,$2,$3,$4,$5,NOW() + INTERVAL '60 seconds')`,
      [hash, req.session.agentId, req.session.agentName, req.session.email, req.session.role || 'agent']);
    const target = (process.env.TRANSCRIPTS_BASE_URL || 'https://cbitranscripts.up.railway.app').replace(/\/$/, '');
    res.redirect(`${target}/sso?code=${encodeURIComponent(code)}`);
  } catch (e) {
    console.error('transcript SSO start:', e);
    res.status(500).send('Could not open Call Transcripts. Please try again.');
  }
});

// The portal pages are matched before express.static, and static is told not to
// serve index.html on its own. Otherwise static answers '/' first and the page
// is handed out before requireAuth ever runs.
// Signing pages are public by design: the token in the URL is the credential.
app.get('/sign/:token', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'views', 'sign.html'));
});

app.get(['/', '/index.html', '/fee-agreement', '/esign'], requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/quote', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'quote.html'));
});

// no-cache means revalidate every time, not "don't cache": the browser still
// gets a 304 when nothing changed, but it can never serve a stale script after
// a deploy. Without an explicit directive browsers invent their own freshness
// lifetime from Last-Modified and hold old files for hours.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

app.post('/api/generate-quote', async (req, res) => {
  const { pdf, language } = req.body;
  if (!pdf) return res.status(400).json({ error: 'No PDF provided' });
  try {
    const https = require('https');
    const pdfParse = require('pdf-parse');
    const isSpanish = language === 'es';

    // Extract text from PDF
    const pdfBuffer = Buffer.from(pdf, 'base64');
    const pdfData = await pdfParse(pdfBuffer);
    const pdfText = pdfData.text.substring(0, 15000); // limit to ~15k chars

    function callClaude(messages, model, maxTokens) {
      const body = JSON.stringify({ model, max_tokens: maxTokens, messages });
      return new Promise((resolve, reject) => {
        const r = https.request({
          hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }
        }, (response) => {
          let raw = '';
          response.on('data', chunk => raw += chunk);
          response.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(new Error('Invalid API response')); } });
        });
        r.on('error', reject);
        r.write(body);
        r.end();
      });
    }

    const jsonSchema = '{"clientName":"","businessAddress":"","businessType":"","quoteNumber":"","quoteDate":"","effectiveDate":"","expirationDate":"","validDays":45,"carrier":"","carrierRating":"","surplusLines":false,"agentName":"Columbia Basin Insurance","annualPremium":"","policyFee":"","totalPremium":"","minimumEarnedPremium":"","minimumEarnedPct":"","coverages":[{"name":"","limit":"","deductible":"","premium":""}],"businessClassifications":[{"code":"","description":"","exposure":"","rate":""}],"exclusions":[""],"additionalFeatures":[""],"conditions":[""],"auditInfo":"","disclaimer":""}';
    const prompt = isSpanish
      ? `Eres un experto en seguros de Columbia Basin Insurance. Lee este texto extraído de una cotización de seguro y extrae TODA la información disponible.

INSTRUCCIONES IMPORTANTES:
- Devuelve SOLO un objeto JSON válido (sin markdown, sin texto adicional).
- Traduce AL ESPAÑOL todos los nombres de coberturas, exclusiones, características adicionales, condiciones, tipo de negocio, descripciones de clasificación y cualquier otro texto descriptivo. Los valores numéricos, fechas, montos y números de póliza déjalos como están.
- Si un campo no está disponible en el documento, usa "" para texto o [] para listas.
- Para "validDays" usa 45 si no se especifica.

ESTRUCTURA JSON:
${jsonSchema}

TEXTO DE LA COTIZACIÓN:
${pdfText}`
      : `You are an insurance expert at Columbia Basin Insurance. Read this extracted text from an insurance quote and extract ALL available information.

IMPORTANT INSTRUCTIONS:
- Return ONLY a valid JSON object (no markdown, no extra text).
- Extract all coverage names, exclusions, features, conditions, and descriptions exactly as written in English.
- If a field is not available in the document, use "" for text fields or [] for arrays.
- For "validDays" use 45 if not specified.

JSON STRUCTURE:
${jsonSchema}

QUOTE TEXT:
${pdfText}`;

    const result = await callClaude([{ role: 'user', content: prompt }], 'claude-sonnet-4-5', 3000);
    if (result.error) throw new Error(result.error.message || 'Generation failed');
    const quote = JSON.parse((result.content?.[0]?.text || '').replace(/```json|```/g, '').trim());
    quote.agentName = quote.agentName || 'Columbia Basin Insurance';

    res.json({ success: true, quote });
  } catch (err) {
    console.error('Quote generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/autofill', async (req, res) => {
  const { pdf } = req.body;
  if (!pdf) return res.status(400).json({ error: 'No PDF provided' });
  try {
    const https = require('https');
    const body = JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
          { type: 'text', text: `Read this insurance policy and return ONLY a JSON object (no markdown) with these fields:
{"formType":"auto_cov|home_cov|trucking_cov|contractor_cov|vehicle_removal","clientName":"","clientEmail":"","policyNumber":"","carrier":"","effectiveDate":"YYYY-MM-DD","expirationDate":"YYYY-MM-DD","annualPremium":"","lineOfBusiness":"","propertyAddress":"","year":"","make":"","model":"","vin":"last 4 only","dotNumber":"","mcNumber":"","radius":"","commodity":"","trade":"","licenseNumber":"","vehicles":[{"year":"","make":"","model":"","vin":"last 4","use":""}],"drivers":[{"name":"","dob":"MM/DD/YYYY","license":"","relationship":""}],"coverages":[{"name":"","status":"offered|declined","recommended":"","selected":""}]}
Extract ALL vehicles and ALL drivers listed in the policy. Detect formType from content. For "carrier" give the insurer's full legal name as printed. For "annualPremium" give the annual or full-term premium as a plain number with no currency symbol. For "lineOfBusiness" give a short description such as "Personal auto", "Homeowners" or "Commercial auto". Use null for unknown fields. Return only JSON.` }
        ]
      }]
    });
    const options = {
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }
    };
    const data = await new Promise((resolve, reject) => {
      const r = https.request(options, (response) => {
        let raw = '';
        response.on('data', chunk => raw += chunk);
        response.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(new Error('Invalid API response')); } });
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });
    if (data.error) throw new Error(data.error.message || 'API error');
    const text = data.content?.[0]?.text || '';
    const fields = JSON.parse(text.replace(/```json|```/g, '').trim());
    res.json({ success: true, fields });
  } catch (err) {
    console.error('Autofill error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/setup-admin-xyz123', async (req, res) => {
  if (!process.env.SETUP_ADMIN_TOKEN || req.query.token !== process.env.SETUP_ADMIN_TOKEN) {
    return res.status(404).end();
  }
  try {
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const tempPassword = crypto.randomBytes(12).toString('base64url');
    const hash = await bcrypt.hash(tempPassword, 12);
    await db.query(
      'INSERT INTO agents (name,email,password_hash,role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO UPDATE SET password_hash=$3',
      ['Admin', 'info@columbiabasininsurance.com', hash, 'admin']
    );
    res.send(`Done! Login: info@columbiabasininsurance.com / ${tempPassword} — change this password immediately after logging in.`);
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', ts: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'db_error', error: e.message });
  }
});

app.use((req, res) => res.status(404).send('Not found'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, async () => {
  console.log(`Columbia Basin Insurance E&O Forms running on port ${PORT}`);
  try {
    await db.query(`
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS client_email TEXT;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS fs_envelope_id TEXT;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS fs_status TEXT DEFAULT 'pending';
      ALTER TABLE submissions DROP COLUMN IF EXISTS az_contact_id;
      ALTER TABLE submissions DROP COLUMN IF EXISTS az_note_id;
      ALTER TABLE submissions DROP COLUMN IF EXISTS az_synced;
      ALTER TABLE submissions DROP COLUMN IF EXISTS az_synced_at;
    `);
    const fs = require('fs');
    await db.query(fs.readFileSync(path.join(__dirname, 'db', 'esign.sql'), 'utf8'));
    await db.query(`
      CREATE TABLE IF NOT EXISTS portal_sso_codes (
        code_hash TEXT PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        agent_name TEXT,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent',
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_portal_sso_expiry ON portal_sso_codes(expires_at);
    `);
    console.log('Schema migration complete');
  } catch(e) {
    console.log('Migration note:', e.message);
  }

  // Started after the migration, so the first pass cannot read columns that
  // do not exist yet.
  require('./services/reminders').start();
});
