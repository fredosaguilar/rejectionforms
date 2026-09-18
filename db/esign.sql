-- E-signature tables.
--
-- Retention: ESIGN §101(d) and RCW 19.360.030 require that a signed record stay
-- accurately reproducible for as long as the law requires the record be kept.
-- Documents are therefore stored as bytes in the database rather than on the
-- container filesystem, which is ephemeral, and the original upload is retained
-- alongside the signed output so both can be reproduced.

CREATE TABLE IF NOT EXISTS envelopes (
  id             SERIAL PRIMARY KEY,
  public_id      TEXT NOT NULL UNIQUE,      -- opaque id used in URLs
  agent_id       INTEGER REFERENCES agents(id),
  agent_name     TEXT,
  agent_email    TEXT,
  title          TEXT NOT NULL,
  message        TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',  -- draft|sent|completed|declined|voided
  file_name      TEXT NOT NULL,
  file_mime      TEXT NOT NULL,
  file_bytes     BYTEA NOT NULL,            -- the document as uploaded
  file_sha256    TEXT NOT NULL,             -- integrity of the original
  signed_bytes   BYTEA,                     -- signed output, with certificate appended
  signed_sha256  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at        TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  voided_at      TIMESTAMPTZ,
  void_reason    TEXT
);

CREATE TABLE IF NOT EXISTS envelope_recipients (
  id             SERIAL PRIMARY KEY,
  envelope_id    INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  routing_order  INTEGER NOT NULL DEFAULT 1,
  -- Only the hash of the signing token is stored. A leaked database row cannot
  -- be used to sign, and the raw token exists only in the emailed link.
  token_hash     TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|viewed|signed|declined
  consent_at     TIMESTAMPTZ,               -- ESIGN 101(c) affirmative consent
  consent_ip     TEXT,
  consent_ua     TEXT,
  viewed_at      TIMESTAMPTZ,
  signed_at      TIMESTAMPTZ,
  signed_ip      TEXT,
  signed_ua      TEXT,
  signature_png  TEXT,                       -- drawn signature, base64 PNG
  typed_name     TEXT,                       -- name typed as intent to sign
  decline_reason TEXT
);

-- Append-only audit trail. Every row is evidence of attribution, so nothing
-- here is ever updated or deleted once written.
CREATE TABLE IF NOT EXISTS envelope_events (
  id             SERIAL PRIMARY KEY,
  envelope_id    INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  recipient_id   INTEGER REFERENCES envelope_recipients(id) ON DELETE SET NULL,
  event          TEXT NOT NULL,   -- created|sent|viewed|consented|signed|declined|completed|voided|downloaded
  actor          TEXT,
  ip             TEXT,
  user_agent     TEXT,
  detail         JSONB,
  at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_env_agent      ON envelopes(agent_id);
CREATE INDEX IF NOT EXISTS idx_env_status     ON envelopes(status);
CREATE INDEX IF NOT EXISTS idx_env_public     ON envelopes(public_id);
CREATE INDEX IF NOT EXISTS idx_rcpt_envelope  ON envelope_recipients(envelope_id);
CREATE INDEX IF NOT EXISTS idx_rcpt_token     ON envelope_recipients(token_hash);
CREATE INDEX IF NOT EXISTS idx_events_env     ON envelope_events(envelope_id, at);

-- Placed fields.
--
-- Coordinates are normalised 0..1 against the page box with a TOP-LEFT origin,
-- matching how the browser lays the placement overlay out. pdf-lib draws from
-- the bottom left, so the flip happens once, at stamping time. Storing
-- normalised values keeps placement correct whatever zoom the agent used and
-- whatever size the page turns out to be.
CREATE TABLE IF NOT EXISTS envelope_fields (
  id            SERIAL PRIMARY KEY,
  envelope_id   INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  recipient_id  INTEGER REFERENCES envelope_recipients(id) ON DELETE CASCADE,
  page          INTEGER NOT NULL,          -- 1-based
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  w             REAL NOT NULL,
  h             REAL NOT NULL,
  type          TEXT NOT NULL,             -- signature|initials|date|text
  label         TEXT,
  required      BOOLEAN NOT NULL DEFAULT TRUE,
  value         TEXT,                      -- typed text, or the date as stamped
  value_png     TEXT,                      -- signature/initials image
  filled_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fields_envelope  ON envelope_fields(envelope_id);
CREATE INDEX IF NOT EXISTS idx_fields_recipient ON envelope_fields(recipient_id);

-- Language of the transaction. ESIGN 101(c) requires the consent disclosure be
-- given in a form the consumer can access and understand; where business is
-- conducted in Spanish the disclosure is presented in Spanish, and the language
-- actually used is recorded on the certificate.
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

-- Optional mobile number for SMS delivery of the signing link.
ALTER TABLE envelope_recipients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE envelope_recipients ADD COLUMN IF NOT EXISTS delivery TEXT NOT NULL DEFAULT 'email';  -- email|sms|both

-- Daily reminders. Opt-in per envelope, capped so a client is nudged rather
-- than harassed, and stopped by the signing flow the moment everyone signs.
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE;
-- Reminders are no longer opted into: anything out for signature is chased.
ALTER TABLE envelopes ALTER COLUMN reminders_enabled SET DEFAULT TRUE;
UPDATE envelopes SET reminders_enabled = TRUE WHERE status = 'sent' AND reminders_enabled = FALSE;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS reminder_last_at  TIMESTAMPTZ;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS reminder_count    INTEGER NOT NULL DEFAULT 0;
