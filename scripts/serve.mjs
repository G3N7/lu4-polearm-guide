// Minimal static server for dist/ (used by "npm start" and the Playwright tests).
// Serves index.html for directories and dist/404.html (status 404) for misses. With --base
// it mounts the site under a path prefix, mirroring GitHub Pages' /lu4-polearm-guide/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, DEFAULT_SITE_URL } from './guide.mjs';

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

// Control characters (U+0000–U+001F, U+007F) never belong in a path; rejecting them also
// keeps them out of the Location header of directory redirects.
const CONTROL_CHARS = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');

/** "/lu4-polearm-guide" | "lu4-polearm-guide/" | "/" → "/lu4-polearm-guide/" | "/" */
export function normaliseBase(base = '/') {
  const b = '/' + String(base).replace(/^\/+|\/+$/g, '');
  return b === '/' ? '/' : b + '/';
}

export function createServer(dir, { base = '/' } = {}) {
  const root = path.resolve(dir);
  const prefix = normaliseBase(base);

  return http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      if (!res.headersSent) send(res, 500, 'text/plain; charset=utf-8', 'Internal server error');
      else res.destroy();
      console.error(err);
    }
  });

  function handle(req, res) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return send(res, 400, 'text/plain; charset=utf-8', 'Bad request');
    }
    if (CONTROL_CHARS.test(pathname)) return miss(res);
    if (prefix !== '/') {
      if (pathname === '/' || pathname + '/' === prefix) return redirect(res, prefix, 302);
      if (!pathname.startsWith(prefix)) return miss(res);
      pathname = pathname.slice(prefix.length - 1);
    }
    // Collapse "." and ".." so nothing outside root can be addressed, then re-check.
    const clean = path.posix.normalize('/' + pathname);
    let file = path.resolve(root, '.' + clean);
    if (file !== root && !file.startsWith(root + path.sep)) return miss(res);

    let stat = fs.existsSync(file) ? fs.statSync(file) : null;
    if (stat && stat.isDirectory()) {
      if (!pathname.endsWith('/')) return redirect(res, prefix.slice(0, -1) + encodeURI(clean.replace(/\/$/, '')) + '/', 301);
      file = path.join(file, 'index.html');
      stat = fs.existsSync(file) ? fs.statSync(file) : null;
    }
    if (!stat || !stat.isFile()) return miss(res);

    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  function miss(res) {
    const nf = path.join(root, '404.html');
    if (fs.existsSync(nf)) return send(res, 404, TYPES['.html'], fs.readFileSync(nf));
    return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  }
}

function redirect(res, location, status) {
  res.writeHead(status, { Location: location });
  res.end();
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function cli(argv) {
  let dir = path.join(ROOT, 'dist');
  let port = 4173;
  let base = '/';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') dir = path.resolve(argv[++i]);
    else if (argv[i] === '--port') port = Number(argv[++i]);
    else if (argv[i] === '--base') base = argv[++i];
    else if (argv[i] === '--pages-path') base = new URL(DEFAULT_SITE_URL).pathname;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    throw new Error(`${dir} has no index.html — run "npm run build" first`);
  }
  const prefix = normaliseBase(base);
  createServer(dir, { base: prefix }).listen(port, '127.0.0.1', () => {
    console.log(`serving ${path.relative(process.cwd(), dir) || '.'} at http://127.0.0.1:${port}${prefix}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv.slice(2));
