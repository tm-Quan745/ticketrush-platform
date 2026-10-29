import http from 'node:http';
import https from 'node:https';

export function attachNotificationProxy(server: http.Server, target: URL) {
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/api/v1/notifications/ws') return;
    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: target.host };
    for (const name of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto']) delete headers[name];
    const upstream = (target.protocol === 'https:' ? https : http).request({
      hostname: target.hostname, port: target.port, protocol: target.protocol,
      path: '/api/v1/notifications/ws', method: 'GET', headers, timeout: 10000,
    });
    upstream.on('upgrade', (response, remote, upstreamHead) => {
      upstream.setTimeout(0);
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`).join('')}\r\n`);
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) remote.write(head);
      socket.pipe(remote).pipe(socket);
      socket.on('close', () => remote.destroy());
      remote.on('close', () => socket.destroy());
      remote.on('error', () => socket.destroy());
    });
    upstream.on('response', response => {
      response.resume();
      socket.end(`HTTP/1.1 ${response.statusCode || 502} Connection rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.end();
  });
}
