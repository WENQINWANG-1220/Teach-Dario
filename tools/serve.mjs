import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const project = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(project, 'dist');
const preferred = Number(process.argv[2] ?? 5190);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.glb':'model/gltf-binary', '.json':'application/json; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png' };
if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65525) throw new Error('Invalid port');
await stat(path.join(root, 'index.html'));
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ service: 'baby-steps', version: 1, project })); return; }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const headers = { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    const range = (req.method === 'GET' || req.method === 'HEAD') ? req.headers.range : undefined;
    let start = 0, end = info.size - 1;
    if (range !== undefined) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
      let valid = !!match && !!(match[1] || match[2]) && info.size > 0;
      if (valid) {
        if (!match[1]) {
          const suffix = Number(match[2]);
          valid = Number.isSafeInteger(suffix) && suffix > 0;
          start = Math.max(0, info.size - suffix);
        } else {
          start = Number(match[1]);
          const requestedEnd = match[2] ? Number(match[2]) : end;
          valid = Number.isSafeInteger(start) && Number.isSafeInteger(requestedEnd) && start < info.size && requestedEnd >= start;
          end = Math.min(requestedEnd, end);
        }
      }
      if (!valid) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}`, 'Content-Length': 0 });
        res.end();
        return;
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    const data = req.method === 'HEAD' ? undefined : await readFile(file);
    res.writeHead(range === undefined ? 200 : 206, headers);
    res.end(data?.subarray(start, end + 1));
  } catch { res.writeHead(404); res.end('Not found'); }
});
let port = preferred;
server.on('error', e => { if (e.code === 'EADDRINUSE' && port < preferred + 10) { server.listen(++port, '127.0.0.1'); } else { console.error(e); process.exit(1); } });
server.listen(port, '127.0.0.1', () => console.log(`Baby Steps: http://127.0.0.1:${port}/`));
