CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS event (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payload JSONB NOT NULL,
  event_status TEXT NOT NULL DEFAULT 'RECEIVED',
  idempotency_key TEXT,
  destination_url TEXT NOT NULL,
  error_details JSONB,
  failed_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSING',
  response_status INT,
  response_body JSONB,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  original_event_id UUID REFERENCES event(id),
  idempotency_key TEXT,
  payload JSONB,
  error_details JSONB,
  status TEXT DEFAULT 'PENDING',
  retry_count INT DEFAULT 0,
  failed_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES event(id),
  attempt_number INT NOT NULL,
  destination_url TEXT NOT NULL,
  request_headers JSONB,
  request_body JSONB,
  status_code INT,
  response_body TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  latency_ms INT,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_status_created ON event(event_status, created_at);
CREATE INDEX IF NOT EXISTS idx_event_locked_at ON event(locked_at) WHERE event_status = 'PROCESSING';
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys(key);
CREATE INDEX IF NOT EXISTS idx_dlq_status ON dead_letter_queue(status);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_event_id ON delivery_attempts(event_id);
