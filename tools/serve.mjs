import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const project = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(project, 'dist');
const preferred = Number(process.argv[2] ?? 5190);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.glb':'model/gltf-binary', '.json':'application/json; charset=utf-8' };
if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65525) throw new Error('Invalid port');
await stat(path.join(root, 'index.html'));
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ service: 'baby-steps', version: 1, project })); return; }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
let port = preferred;
server.on('error', e => { if (e.code === 'EADDRINUSE' && port < preferred + 10) { server.listen(++port, '127.0.0.1'); } else { console.error(e); process.exit(1); } });
server.listen(port, '127.0.0.1', () => console.log(`Baby Steps: http://127.0.0.1:${port}/`));
