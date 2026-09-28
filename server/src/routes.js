const { getHistoricalData } = require('./storage');

function createRoutes(storage, generator, stream, config) {
    return {
        async handle(req, res, url) {
            // Historical Data Endpoint
            if (req.method === 'GET' && url.pathname === '/api/history') {
                try {
                    const data = await getHistoricalData(1000);
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                    res.end(JSON.stringify(data));
                    return true;
                } catch (error) {
                    console.error("API Error in /api/history route:", error);
                    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
                    res.end(JSON.stringify({ error: "Failed to fetch telemetry history" }));
                    return true;
                }
            }
            
            // Health Check Endpoint
            if (req.method === 'GET' && url.pathname === '/api/status') {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ status: 'online', message: 'Sensor Data Engine API is active.' }));
                return true;
            }

            // Return false if the route doesn't match anything here
            return false; 
        }
    };
}

module.exports = { createRoutes };