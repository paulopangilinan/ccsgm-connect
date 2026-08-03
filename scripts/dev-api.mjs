#!/usr/bin/env node
// Local stand-in for Vercel's serverless runtime so `/api/*` works under
// `ng serve` (the Vercel CLI can't run on Node 26). Loads .env, imports the
// real handler from api/, and adapts Node's req/res to the Vercel shapes.
import http from 'node:http';

try {
  process.loadEnvFile();
} catch {
  // rely on already-set env vars
}

const { default: sendSms } = await import(new URL('../api/send-sms.ts', import.meta.url));

const PORT = Number(process.env.DEV_API_PORT ?? 3900);

const routes = {
  '/api/send-sms': sendSms,
};

http
  .createServer(async (req, res) => {
    const path = (req.url ?? '').split('?')[0];
    const handler = routes[path];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
    }

    const vercelReq = {
      method: req.method,
      headers: req.headers,
      body: raw ? JSON.parse(raw) : {},
    };
    const vercelRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(obj) {
        res.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
        return this;
      },
    };

    try {
      await handler(vercelReq, vercelRes);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
  })
  .listen(PORT, () => console.log(`dev-api listening on http://localhost:${PORT}`));
