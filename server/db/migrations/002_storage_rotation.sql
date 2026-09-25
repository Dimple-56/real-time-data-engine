-- 1. Metadata table
CREATE TABLE telemetry_metadata (
    id SERIAL PRIMARY KEY,
    session_name VARCHAR(255),
    header_info TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. The 3 rotating data sheets
CREATE TABLE telemetry_data_1 (
    id SERIAL, p1 REAL, p2 REAL, dp REAL, rpm REAL, timestamp TIMESTAMP DEFAULT NOW()
);
CREATE TABLE telemetry_data_2 (
    id SERIAL, p1 REAL, p2 REAL, dp REAL, rpm REAL, timestamp TIMESTAMP DEFAULT NOW()
);
CREATE TABLE telemetry_data_3 (
    id SERIAL, p1 REAL, p2 REAL, dp REAL, rpm REAL, timestamp TIMESTAMP DEFAULT NOW()
);

-- 3. The unified view
CREATE VIEW telemetry_active_stream AS
SELECT * FROM telemetry_data_1
UNION ALL
SELECT * FROM telemetry_data_2
UNION ALL
SELECT * FROM telemetry_data_3;