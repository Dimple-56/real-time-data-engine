CREATE TABLE IF NOT EXISTS readings (
    id BIGSERIAL PRIMARY KEY,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS readings_created_at_id_idx ON readings (created_at, id);
CREATE TABLE IF NOT EXISTS feed_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    running BOOLEAN NOT NULL DEFAULT FALSE,
    last_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO feed_state (singleton, running, last_values)
VALUES (TRUE, FALSE, '{}'::jsonb)
ON CONFLICT (singleton) DO NOTHING;
