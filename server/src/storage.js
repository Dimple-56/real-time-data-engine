const { Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy server/.env.example to server/.env and configure it.");
}
const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : false
});

async function initializeStorage() {
    const migration = fs.readFileSync(path.resolve(__dirname, "../db/migrations/001_initial.sql"), "utf8");
    await pool.query(migration);
}
async function getFeedState() {
    const result = await pool.query("SELECT running, last_values FROM feed_state WHERE singleton = TRUE");
    return result.rows[0] || { running: false, last_values: {} };
}
async function setFeedState(running, lastValues) {
    const sql = "INSERT INTO feed_state (singleton, running, last_values, updated_at) VALUES (TRUE, $1, $2::jsonb, NOW()) " +
        "ON CONFLICT (singleton) DO UPDATE SET running = EXCLUDED.running, last_values = EXCLUDED.last_values, updated_at = NOW() " +
        "RETURNING running, last_values";
    const result = await pool.query(sql, [running, JSON.stringify(lastValues || {})]);
    return result.rows[0];
}
async function getLatestReading() {
    const result = await pool.query("SELECT id, payload FROM readings ORDER BY id DESC LIMIT 1");
    if (!result.rows.length) return null;
    return { id: Number(result.rows[0].id), ...result.rows[0].payload };
}
async function saveReading(row) {
    const result = await pool.query("INSERT INTO readings (payload) VALUES ($1::jsonb) RETURNING id", [JSON.stringify(row)]);
    return { id: Number(result.rows[0].id), ...row };
}
async function listReadings(options) {
    const limit = Math.max(1, Math.min(Number(options.limit) || 1000, 5000));
    let result;
    if (options.afterId != null) {
        result = await pool.query("SELECT id, payload FROM readings WHERE id > $1 ORDER BY id ASC LIMIT $2", [options.afterId, limit]);
        return result.rows.map((r) => ({ id: Number(r.id), ...r.payload }));
    }
    if (options.beforeId != null) {
        result = await pool.query("SELECT id, payload FROM readings WHERE id < $1 ORDER BY id DESC LIMIT $2", [options.beforeId, limit]);
    } else {
        result = await pool.query("SELECT id, payload FROM readings ORDER BY id DESC LIMIT $1", [limit]);
    }
    return result.rows.reverse().map((r) => ({ id: Number(r.id), ...r.payload }));
}
async function getReadingCount() {
    const result = await pool.query("SELECT COUNT(*)::bigint AS count FROM readings");
    return Number(result.rows[0].count);
}
async function closeStorage() { await pool.end(); }

module.exports = { initializeStorage, getFeedState, setFeedState, getLatestReading, saveReading, listReadings, getReadingCount, closeStorage };
