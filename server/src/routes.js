const crypto = require("node:crypto");

function createRoutes(storage, generator, stream, config) {
    function authorized(req) {
        const header = req.headers.authorization || "";
        const match = /^Bearer\s+(.+)$/i.exec(header);
        if (!match) return false;
        const supplied = crypto.createHash("sha256").update(match[1]).digest();
        const expected = crypto.createHash("sha256").update(config.feedControlSecret).digest();
        return crypto.timingSafeEqual(supplied, expected);
    }

    async function handle(req, res, url) {
        const pathname = url.pathname;
        if (req.method === "GET" && pathname === "/api/status") {
            return json(res, 200, await generator.status());
        }
        if (req.method === "GET" && pathname === "/api/readings") {
            const limit = Number(url.searchParams.get("limit")) || 1000;
            const beforeId = url.searchParams.has("beforeId") ? Number(url.searchParams.get("beforeId")) : null;
            const afterId = url.searchParams.has("afterId") ? Number(url.searchParams.get("afterId")) : null;
            const rows = await storage.listReadings({ limit, beforeId, afterId });
            return json(res, 200, {
                rows,
                count: await storage.getReadingCount(),
                latestId: rows.length ? rows[rows.length - 1].id : 0
            });
        }
        if (req.method === "GET" && pathname === "/api/stream") {
            return stream.handle(req, res, url);
        }
        if (req.method === "POST" && pathname === "/api/feed/start") {
            if (!authorized(req)) return json(res, 401, { error: "Feed control authorization required." });
            return json(res, 200, await generator.start());
        }
        if (req.method === "POST" && pathname === "/api/feed/stop") {
            if (!authorized(req)) return json(res, 401, { error: "Feed control authorization required." });
            return json(res, 200, await generator.stop());
        }
        return false;
    }
    return { handle };
}

function json(res, status, body) {const express = require('express');
const router = express.Router();

// Import the database retrieval function from your newly updated storage.js
const { getHistoricalData } = require('./storage');

/**
 * 1. Historical Data Endpoint
 * The frontend dashboard and Excel export tool will call this route 
 * to grab the seamless timeline from your 3-sheet database.
 */
router.get('/history', async (req, res) => {
    try {
        // Fetch the 1000 most recent sensor readings
        const data = await getHistoricalData(1000); 
        res.json(data);
    } catch (error) {
        console.error("API Error in /history route:", error);
        res.status(500).json({ error: "Failed to fetch telemetry history" });
    }
});

/**
 * 2. Health Check Endpoint
 * A simple route to verify that your Voroa backend is online and responding.
 */
router.get('/status', (req, res) => {
    res.json({ 
        status: 'online', 
        message: 'Sensor Data Engine API is active and listening.' 
    });
});

// Export the router so server.js can use it
module.exports = router;
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(body));
}

module.exports = { createRoutes };
