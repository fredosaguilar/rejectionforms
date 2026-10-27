-- Broker fee payments.
--
-- Clients pay the agency fee disclosed on their signed fee agreement. The card
-- itself never reaches this application: the client is handed to the
-- processor's own hosted page, and what comes back here is an outcome, never a
-- card number. Nothing in these tables is in PCI scope.
--
-- Amounts are integer cents. A fee is money owed to the agency and money the
-- client is charged, and a float cannot be trusted to agree with either.

CREATE TABLE IF NOT EXISTS payment_requests (
  id              SERIAL PRIMARY KEY,
  public_id       TEXT NOT NULL UNIQUE,     -- opaque id used in URLs and on the receipt
  receipt_no      TEXT,                     -- assigned when it is paid
  agent_id        INTEGER REFERENCES agents(id),
  agent_name      TEXT,
  agent_email     TEXT,
  client_name     TEXT NOT NULL,
  client_email    TEXT,
  client_phone    TEXT,
  description     TEXT NOT NULL,            -- what the fee is for, in the client's words
  policy_number   TEXT,
  language        TEXT NOT NULL DEFAULT 'en',
  -- The agency fee, and the processing fee the client is charged on top of it.
  -- The surcharge depends on how they choose to pay, so it is only fixed once
  -- they have chosen; until then it is zero and the total is the fee alone.
  fee_cents       INTEGER NOT NULL CHECK (fee_cents > 0),
  surcharge_cents INTEGER NOT NULL DEFAULT 0 CHECK (surcharge_cents >= 0),
  method          TEXT,                     -- card|bank|manual
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft|sent|processing|paid|refunded|void
  -- Only the hash of the payment token is stored. A database read cannot be
  -- turned into a payment page; the raw token exists only in the link sent.
  token_hash      TEXT UNIQUE,
  -- The fee agreement this fee was read off, when it came from one.
  submission_id   INTEGER,
  -- What the processor calls it. Kept so a payment here can be found there.
  provider        TEXT,
  provider_session TEXT,
  provider_intent  TEXT,
  paid_cents      INTEGER,                  -- what actually settled
  card_brand      TEXT,
  card_last4      TEXT,
  failure_reason  TEXT,
  refunded_cents  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  viewed_at       TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_status  ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_created ON payment_requests(created_at DESC);

-- Append-only. A receipt is only as good as the record behind it, so nothing
-- here is updated or deleted once written.
CREATE TABLE IF NOT EXISTS payment_events (
  id          SERIAL PRIMARY KEY,
  request_id  INTEGER NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,   -- created|sent|viewed|checkout_started|paid|failed|refunded|voided|receipt_sent
  actor       TEXT,
  ip          TEXT,
  user_agent  TEXT,
  detail      JSONB,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_request ON payment_events(request_id, at);

-- The processor retries a webhook until it is acknowledged, and a retry must
-- not pay a fee twice or send a second receipt. An event is recorded here
-- before it is acted on, and a second arrival of the same one does nothing.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id   TEXT PRIMARY KEY,
  kind       TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
