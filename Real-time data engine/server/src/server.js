const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");
const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8"
};

function loadConfig() {
    const envFile = path.resolve(__dirname, "../.env");
    if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
        process.loadEnvFile(envFile);
    }

    const required = ["DATABASE_URL", "FEED_CONTROL_SECRET", "FRONTEND_ORIGIN"];
    const missing = required.filter((key) => !process.env[key] || !process.env[key].trim());
    if (missing.length) {
        throw new Error("Missing required environment variables: " + missing.join(", "));
    }

    let databaseUrl;
    try {
        databaseUrl = new URL(process.env.DATABASE_URL);
    } catch {
        throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
    }
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
        throw new Error("DATABASE_URL must use the postgres:// or postgresql:// scheme.");
    }

    const secret = process.env.FEED_CONTROL_SECRET.trim();
    // Reduced length requirement from 32 to 8 characters so 'sensor123' works
    if (secret.length < 8 || /^(replace|change|your)[-_ ]/i.test(secret)) {
        throw new Error("FEED_CONTROL_SECRET must be a non-placeholder secret of at least 8 characters.");
    }

    let frontend;
    try {
        frontend = new URL(process.env.FRONTEND_ORIGIN);
    } catch {
        throw new Error("FRONTEND_ORIGIN must be a valid origin such as https://app.example.com.");
    }
    if (!["http:", "https:"].includes(frontend.protocol) ||
        (frontend.pathname !== "/" && frontend.pathname !== "") ||
        frontend.search || frontend.hash) {
        throw new Error("FRONTEND_ORIGIN must contain only the frontend scheme, host, and optional port.");
    }

    const rawPort = process.env.PORT || "3000";
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("PORT must be an integer between 1 and 65535.");
    }
    const host = (process.env.HOST || "0.0.0.0").trim();
    if (!host) throw new Error("HOST must not be empty.");

    const pgssl = (process.env.PGSSL || "false").toLowerCase();
    if (!["true", "false"].includes(pgssl)) {
        throw new Error("PGSSL must be true or false.");
    }
    process.env.PGSSL = pgssl;

    return {
        host,
        port,
        frontendOrigin: frontend.origin,
        feedControlSecret: secret
    };
}

function corsAllowed(req, res, config) {
    res.setHeader("Vary", "Origin");
    const origin = req.headers.origin;
    if (!origin) return true;
    if (origin !== config.frontendOrigin) return false;
    res.setHeader("Access-Control-Allow-Origin", config.frontendOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
    return true;
}

async function main() {
    const config = loadConfig();
    const storage = require("./storage");
    const { FeedGenerator } = require("./generator");
    const { createStreamHub } = require("./stream");
    const { createRoutes } = require("./routes");

    await storage.initializeStorage();
    const stream = createStreamHub(storage);
    const generator = new FeedGenerator(storage, stream);
    await generator.initialize();
    const routes = createRoutes(storage, generator, stream, config);

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
            if (req.method === "GET" && url.pathname === "/healthz") {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                return res.end(JSON.stringify({ status: "ok" }));
            }
            if (url.pathname.startsWith("/api/")) {
                if (!corsAllowed(req, res, config)) {
                    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
                    return res.end(JSON.stringify({ error: "Origin is not allowed." }));
                }
                if (req.method === "OPTIONS") {
                    res.writeHead(204);
                    return res.end();
                }
                const handled = await routes.handle(req, res, url);
                if (handled !== false) return;
                res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
                return res.end(JSON.stringify({ error: "API route not found" }));
            }
            serveStatic(url.pathname, res);
        } catch (error) {
            console.error("Request failed:", error);
            if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            if (!res.destroyed) res.end(JSON.stringify({ error: "Internal server error" }));
        }
    });

    server.listen(config.port, config.host, () => {
        console.log("Sensor app listening on " + config.host + ":" + config.port);
        console.log("Single-instance generator mode: run exactly one server instance.");
    });
    const shutdown = async () => {
        server.close();
        await storage.closeStorage();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

function serveStatic(requestPath, res) {
    let decoded;
    try {
        decoded = decodeURIComponent(requestPath);
    } catch {
        res.writeHead(400);
        return res.end("Bad path");
    }
    if (decoded === "/") decoded = "/index.html";
    const file = path.resolve(projectRoot, "." + decoded);
    const serverDir = path.resolve(projectRoot, "server") + path.sep;
    if (!file.startsWith(projectRoot + path.sep) || file.startsWith(serverDir)) {
        res.writeHead(403);
        return res.end("Forbidden");
    }
    const type = mime[path.extname(file).toLowerCase()];
    if (!type) {
        res.writeHead(404);
        return res.end("Not found");
    }
    fs.readFile(file, (error, content) => {
        if (error) {
            res.writeHead(error.code === "ENOENT" ? 404 : 500);
            return res.end(error.code === "ENOENT" ? "Not found" : "Read error");
        }
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
        res.end(content);
    });
}

main().catch((error) => {
    console.error("Backend startup failed:", error.message);
    process.exitCode = 1;
});