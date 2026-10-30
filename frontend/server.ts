import { config } from 'dotenv';
config({ path: '../.env' });
import express from 'express';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { attachNotificationProxy } from './notification-proxy';
import { resolveBackendUrl } from './backend-url';

// Forward API bytes unchanged: Spring owns authentication and all business state.
const app = express();
const server = http.createServer(app);
const target = resolveBackendUrl(process.env.BACKEND_URL);
if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Invalid BACKEND_URL');
attachNotificationProxy(server, target);

const backendWakeTimeoutMs = 4 * 60 * 1000;
let backendWakePromise: Promise<void> | undefined;

// Render's free instances can take a few minutes to resume. Keep a request alive
// independently of the browser request, which the browser cancels after its own timeout.
function wakeBackend() {
  if (backendWakePromise) return backendWakePromise;
  console.info(`Waking backend at ${target.origin}`);
  backendWakePromise = new Promise<void>(resolve => {
    const upstream = (target.protocol === 'https:' ? https : http).request({
      hostname: target.hostname,
      port: target.port,
      protocol: target.protocol,
      path: '/actuator/health',
      method: 'GET',
      headers: { host: target.host },
      timeout: backendWakeTimeoutMs,
    }, response => {
      response.resume();
      response.once('end', () => {
        console.info(`Backend wake-up response: ${response.statusCode}`);
        resolve();
      });
    });
    upstream.once('timeout', () => { console.warn('Backend wake-up timed out'); upstream.destroy(); resolve(); });
    upstream.once('error', () => { console.warn('Backend wake-up request failed'); resolve(); });
    upstream.end();
  }).finally(() => { backendWakePromise = undefined; });
  return backendWakePromise;
}
// Keep platform liveness independent from downstream API and datastore health.
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'UP' }));
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') && req.path !== '/actuator/health') return next();
  void wakeBackend();
  const headers: http.OutgoingHttpHeaders = { ...req.headers, host: target.host };
  delete headers['forwarded'];
  delete headers['x-forwarded-for'];
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  const upstream = (target.protocol === 'https:' ? https : http).request({
    hostname: target.hostname, port: target.port, protocol: target.protocol,
    path: req.originalUrl, method: req.method, headers, timeout: 15000,
  }, response => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Backend timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ code: 'BACKEND_UNAVAILABLE', message: 'Không kết nối được backend Spring Boot.' });
    else res.destroy();
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
});
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('dist')));
  app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => {
  console.log(`TicketRush frontend ready; API forwarded to ${target.origin}`);
});
