import { config } from 'dotenv';
config({ path: '../.env' });
import express from 'express';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { attachNotificationProxy } from './notification-proxy';

// Forward API bytes unchanged: Spring owns authentication and all business state.
const app = express();
const server = http.createServer(app);
const target = new URL(process.env.BACKEND_URL || 'http://127.0.0.1:8080');
if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Invalid BACKEND_URL');
attachNotificationProxy(server, target);
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') && req.path !== '/actuator/health') return next();
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
  console.log('TicketRush frontend ready; API forwarded to Spring Boot');
});
