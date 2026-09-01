/* Wonky Boy - tools/serve.js
 * Zero-dependency static server for local play and phone testing.
 * Run: node tools/serve.js [port]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.argv[2], 10) || 5178;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

http.createServer((req, res) => {
  /* Dev-only: lets the page hand a rendered canvas back to disk so frames can
   * be inspected without a visible browser window. Local server only. */
  if (req.method === 'POST' && req.url.startsWith('/_shot/')) {
    const name = path.basename(req.url.slice(7)).replace(/[^\w.-]/g, '') || 'shot.png';
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const dir = path.join(ROOT, 'shots');
      fs.mkdirSync(dir, { recursive: true });
      const raw = Buffer.concat(chunks).toString('utf8');
      const b64 = raw.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(path.join(dir, name), Buffer.from(b64, 'base64'));
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('saved ' + name);
    });
    return;
  }

  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));

  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Wonky Boy running at http://localhost:' + PORT + '/');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  on your network: http://' + net.address + ':' + PORT + '/');
      }
    }
  }
});
