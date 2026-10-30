// Muse hosted server. Serves the page and proxies chat requests to Anthropic.
// Requires Node 18+. Run: ANTHROPIC_API_KEY=sk-ant-... node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY;
const APP_PASSWORD = process.env.APP_PASSWORD;
const PAGE = path.join(__dirname, "public", "index.html");
const MAX_BODY = 200 * 1024; // 200 KB
const ALLOWED_MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"];

if (!KEY || !APP_PASSWORD) {
  console.error("Set ANTHROPIC_API_KEY and APP_PASSWORD before starting the server.");
  process.exit(1);
}

// HTTP Basic Auth: username "muse", password from APP_PASSWORD.
function authorized(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const [user, pass] = Buffer.from(header.slice(6), "base64").toString().split(":");
  return user === "muse" && pass === APP_PASSWORD;
}

// Simple per-IP rate limit: 20 requests per minute.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const STATIC = {
  "/manifest.json": "application/manifest+json",
  "/sw.js": "application/javascript; charset=utf-8",
  "/icon.svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  if (!authorized(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Muse"', "Content-Type": "text/plain" });
    return res.end("Login required");
  }
  if (req.method === "GET" && STATIC[req.url]) {
    return fs.readFile(path.join(__dirname, "public", req.url), (err, data) =>
      err ? send(res, 404, { error: "Not found" }) : send(res, 200, data, STATIC[req.url]));
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    return fs.readFile(PAGE, (err, data) => err ? send(res, 500, { error: "page missing" }) : send(res, 200, data, "text/html; charset=utf-8"));
  }

  if (req.method === "POST" && req.url === "/api/messages") {
    const ip = req.socket.remoteAddress;
    if (rateLimited(ip)) return send(res, 429, { error: { message: "Too many requests. Wait a minute and try again." } });

    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > MAX_BODY) { req.destroy(); }
    });
    req.on("end", async () => {
      let payload;
      try { payload = JSON.parse(body); } catch (_) { return send(res, 400, { error: { message: "Invalid JSON." } }); }
      if (!ALLOWED_MODELS.includes(payload.model)) payload.model = ALLOWED_MODELS[0];
      payload.max_tokens = Math.min(payload.max_tokens || 800, 1200);

      try {
        const upstream = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify(payload)
        });
        const text = await upstream.text();
        send(res, upstream.status, text);
      } catch (err) {
        send(res, 502, { error: { message: "Upstream request failed." } });
      }
    });
    return;
  }

  send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => console.log(`Muse running on http://localhost:${PORT}`));
