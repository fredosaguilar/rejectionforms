-- Run this once to set up the database schema
-- Railway: connect via psql $DATABASE_URL and paste this file

CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',   -- 'agent' | 'admin'
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  form_type TEXT NOT NULL,              -- 'vehicle_removal' | 'auto_cov' | 'home_cov' | 'trucking_cov' | 'contractor_cov'
  agent_id INTEGER REFERENCES agents(id),
  agent_name TEXT,
  client_name TEXT,
  client_email TEXT,                    -- used to send Formstack Sign request
  policy_number TEXT,
  carrier TEXT,
  form_data JSONB NOT NULL,             -- full form payload
  signature_client TEXT,                -- base64 PNG (in-app signature)
  signature_agent TEXT,                 -- base64 PNG (in-app signature)
  fs_envelope_id TEXT,                  -- Formstack Sign envelope ID
  fs_status TEXT DEFAULT 'pending',     -- 'pending' | 'sent' | 'partial' | 'complete' | 'voided'
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_agent ON submissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_submissions_fs_envelope ON submissions(fs_envelope_id);
CREATE INDEX IF NOT EXISTS idx_submissions_form_type ON submissions(form_type);
CREATE INDEX IF NOT EXISTS idx_submissions_client ON submissions(client_name);

-- Default admin account (password: ChangeMe123!)
-- Change immediately after first login via /admin/agents
INSERT INTO agents (name, email, password_hash, role)
VALUES (
  'Admin',
  'admin@columbibasinins.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGX8L5K5X5X5X5X5X5X5X5X5',
  'admin'
) ON CONFLICT DO NOTHING;
