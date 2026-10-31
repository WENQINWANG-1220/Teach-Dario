import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const video = await readFile(new URL('../dist/media/ending.mp4', import.meta.url));
const still = await readFile(new URL('../dist/media/ending-last-frame.png', import.meta.url));
// Reserve an available port briefly; the server also retries adjacent ports if needed.
const reservation = net.createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
const child = spawn(process.execPath, ['tools/serve.mjs', String(port)], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });

try {
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${stderr}`)), 5000);
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${stderr}`)); });
  });
  for (const [asset, expected, type] of [
    ['/media/ending.mp4', video, 'video/mp4'],
    ['/media/ending-last-frame.png', still, 'image/png'],
  ]) {
    const response = await fetch(base + asset);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
    assert.equal(response.headers.get('content-length'), String(expected.length));
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    const head = await fetch(base + asset, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), type);
    assert.equal(head.headers.get('content-length'), String(expected.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  }
  for (const [range, start, end] of [
    ['bytes=0-99', 0, 99],
    ['bytes=100-199', 100, 199],
    [`bytes=${video.length - 100}-`, video.length - 100, video.length - 1],
    ['bytes=-100', video.length - 100, video.length - 1],
    [`bytes=${video.length - 10}-${video.length + 100}`, video.length - 10, video.length - 1],
    [`bytes=-${video.length + 100}`, 0, video.length - 1],
  ]) {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(base + '/media/ending.mp4', { method, headers: { Range: range } });
      assert.equal(response.status, 206, `${method} ${range}`);
      assert.equal(response.headers.get('content-type'), 'video/mp4');
      assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${video.length}`);
      assert.equal(response.headers.get('content-length'), String(end - start + 1));
      assert.equal(response.headers.get('accept-ranges'), 'bytes');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), method === 'HEAD' ? Buffer.alloc(0) : video.subarray(start, end + 1));
    }
  }
  for (const range of ['bytes=', 'bytes=-', 'bytes=-0', 'bytes=10-9', 'bytes=0-1,3-4', 'items=0-99', `bytes=${video.length}-`, 'bytes=9007199254740992-']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(base + '/media/ending.mp4', { method, headers: { Range: range } });
      assert.equal(response.status, 416, `${method} ${range}`);
      assert.equal(response.headers.get('content-range'), `bytes */${video.length}`);
      assert.equal(response.headers.get('content-length'), '0');
      assert.equal((await response.arrayBuffer()).byteLength, 0);
    }
  }
  const traversal = await fetch(base + '/%2e%2e%2fpackage.json');
  assert.equal(traversal.status, 403);
  assert.equal((await fetch(base + '/media/missing.mp4')).status, 404);
  console.log('Media server passed: MP4/PNG, GET/HEAD, byte ranges, invalid ranges, path protection.');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const closed = once(child, 'close');
    child.kill();
    await closed;
  }
}
