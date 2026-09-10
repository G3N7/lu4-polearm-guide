// Minimal static server for dist/ (used by "npm start" and the Playwright tests).
// Serves index.html for directories and dist/404.html (status 404) for misses.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './guide.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
};

export function createServer(dir) {
  const root = path.resolve(dir);
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return send(res, 400, 'text/plain; charset=utf-8', 'Bad request');
    }
    // Resolve inside root; path.resolve collapses any ".." segments.
    let file = path.resolve(root, '.' + path.posix.normalize('/' + pathname));
    if (file !== root && !file.startsWith(root + path.sep)) return miss();
    let stat = fs.existsSync(file) ? fs.statSync(file) : null;
    if (stat && stat.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: pathname + '/' });
        return res.end();
      }
      file = path.join(file, 'index.html');
      stat = fs.existsSync(file) ? fs.statSync(file) : null;
    }
    if (!stat || !stat.isFile()) return miss();
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
    fs.createReadStream(file).pipe(res);

    function miss() {
      const nf = path.join(root, '404.html');
      if (fs.existsSync(nf)) return send(res, 404, TYPES['.html'], fs.readFileSync(nf));
      return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    }
  });
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function cli(argv) {
  let dir = path.join(ROOT, 'dist');
  let port = 4173;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') dir = path.resolve(argv[++i]);
    else if (argv[i] === '--port') port = Number(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    throw new Error(`${dir} has no index.html — run "npm run build" first`);
  }
  createServer(dir).listen(port, '127.0.0.1', () => {
    console.log(`serving ${path.relative(process.cwd(), dir) || '.'} at http://127.0.0.1:${port}/`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv.slice(2));
