const { Pool } = require('pg');

// 1. Database Connection Configuration
// Utilizes the DATABASE_URL environment variable provided by Voroa
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Enforces the required SSL connection for managed DBs
    }
});

// 2. Rotation Configuration (1GB Voroa Limit)
const MAX_ROWS = 2500000;      // 100% capacity per sheet (~330MB)
const WIPE_THRESHOLD = 1875000; // 75% capacity trigger (~250MB)

// State tracking (must remain outside functions to persist during streams)
let currentSheet = 1;
let rowCount = 0;

/**
 * 3. Ingestion Function: Saves live data and manages the circular buffer
 * @param {Object} data - The sensor payload containing p1, p2, dp, and rpm
 */
async function saveSensorData(data) {
    try {
        // Insert into the currently active sheet
        const insertQuery = `INSERT INTO telemetry_data_${currentSheet} (p1, p2, dp, rpm) VALUES ($1, $2, $3, $4)`;
        await pool.query(insertQuery, [data.p1, data.p2, data.dp, data.rpm]);
        rowCount++;

        // Asynchronously wipe the next sheet when current hits 75%
        if (rowCount === WIPE_THRESHOLD) {
            let sheetToWipe = currentSheet === 3 ? 1 : currentSheet + 1;
            console.log(`Capacity threshold reached. Wiping sheet ${sheetToWipe}...`);
            
            pool.query(`TRUNCATE TABLE telemetry_data_${sheetToWipe}`)
                .catch(err => console.error("Database wipe failed:", err));
        }

        // Rotate to the next sheet when current hits 100%
        if (rowCount >= MAX_ROWS) {
            currentSheet = currentSheet === 3 ? 1 : currentSheet + 1;
            rowCount = 0; // Reset for the newly opened sheet
            console.log(`Rotation complete. Now writing to sheet ${currentSheet}`);
        }
    } catch (error) {
        console.error("Error saving telemetry data:", error);
    }
}

/**
 * 4. Retrieval Function: Fetches seamless data for the frontend
 * Queries the unified VIEW so the dashboard doesn't have to handle rotation logic
 * @param {number} limit - Number of recent records to fetch
 */
async function getHistoricalData(limit = 1000) {
    try {
        const query = `
            SELECT * FROM telemetry_active_stream 
            ORDER BY timestamp DESC 
            LIMIT $1
        `;
        const result = await pool.query(query, [limit]);
        return result.rows;
    } catch (error) {
        console.error("Error retrieving historical data:", error);
        return [];
    }
}

// 5. Export the modules for routes.js and stream.js to use
module.exports = {
    pool,
    saveSensorData,
    getHistoricalData
};