const { Client } = require('pg');

const connectionString = "postgres://postgres:jK1DlPT07Xte5vr-Zzaf5pmsrq1dPoMJ@db-f1c4b8453015.db.getvoroa.com:20972/postgres?sslmode=require";

const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

const sql = `
-- 1. Ensure the critical state table exists for backend generator logic
CREATE TABLE IF NOT EXISTS feed_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    running BOOLEAN NOT NULL DEFAULT FALSE,
    last_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO feed_state (singleton, running, last_values)
VALUES (TRUE, FALSE, '{}'::jsonb)
ON CONFLICT (singleton) DO NOTHING;

-- 2. Clean up any previous experimental tables to avoid conflicts
DROP VIEW IF EXISTS telemetry_active_stream;
DROP TABLE IF EXISTS telemetry_data_1, telemetry_data_2, telemetry_data_3, telemetry_metadata;
DROP SEQUENCE IF EXISTS telemetry_id_seq;

-- 3. Create a shared ID sequence to maintain absolute chronological order across all 3 sheets
CREATE SEQUENCE telemetry_id_seq;

-- 4. Create the 3 rotating sheets using the JSONB payload structure required by your frontend
CREATE TABLE telemetry_data_1 (
    id BIGINT PRIMARY KEY DEFAULT nextval('telemetry_id_seq'),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE telemetry_data_2 (
    id BIGINT PRIMARY KEY DEFAULT nextval('telemetry_id_seq'),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE telemetry_data_3 (
    id BIGINT PRIMARY KEY DEFAULT nextval('telemetry_id_seq'),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create the Metadata table (your "Safe Box")
CREATE TABLE telemetry_metadata (
    id SERIAL PRIMARY KEY,
    session_name VARCHAR(255),
    header_info TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Create the unified view for seamless frontend reads
CREATE VIEW telemetry_active_stream AS
SELECT * FROM telemetry_data_1
UNION ALL SELECT * FROM telemetry_data_2
UNION ALL SELECT * FROM telemetry_data_3;
`;

async function setupDB() {
    try {
        await client.connect();
        await client.query(sql);
        console.log("✅ Complete 3-Sheet JSONB architecture successfully applied!");
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await client.end();
    }
}
setupDB();