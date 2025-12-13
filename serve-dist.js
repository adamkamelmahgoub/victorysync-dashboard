#!/usr/bin/env node

/**
 * Simple HTTP server to serve the built client on port 3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
let BASE_PATH = process.env.VITE_BASE_PATH ?? '/';
// Normalize base path to always end with a slash, and ensure it starts with a slash.
let normalizedBase = (BASE_PATH.startsWith('/') ? BASE_PATH : '/' + BASE_PATH).replace(/([^/])$/, '$1/')

// If no explicit base path was provided, attempt to detect it from index.html
if (process.env.VITE_BASE_PATH == null || process.env.VITE_BASE_PATH === '') {
  try {
    const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
    // Find the first script src or link href that includes '/assets/' and extract prefix
    const m = indexHtml.match(/(?:src|href)\s*=\s*\"(\/[^\"]*assets\/[^"]+)\"/);
    if (m && m[1]) {
      const possible = m[1];
      // possible is like '/dashboard/assets/... or /assets/...'
      const baseCandidate = possible.replace(/\/assets\/.*/, '/');
      if (baseCandidate) {
        BASE_PATH = baseCandidate;
        normalizedBase = (BASE_PATH.startsWith('/') ? BASE_PATH : '/' + BASE_PATH).replace(/([^/])$/, '$1/');
        console.log(`[server] Auto-detected VITE_BASE_PATH -> '${normalizedBase}' from index.html`);
      }
    }
  } catch (e) {
    // ignore
  }
}
const DIST_DIR = path.join(__dirname, 'client/dist');

console.log(`[server] Starting client server on port ${PORT}`);
console.log(`[server] Serving files from: ${DIST_DIR}`);

const server = http.createServer((req, res) => {
  const now = new Date().toISOString();
  console.log(`[serve-dist] ${now} ${req.method} ${req.url}`);
  // Parse the URL
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  console.log(`[serve-dist] Request mapping -> req.url=${req.url}, initialPath=${parsedUrl.pathname}, normalizedBase=${normalizedBase}`);
  
  // Default to index.html for root
  if (pathname === '/') {
    pathname = '/index.html';
  }
  
  // If the path looks like a route (no extension) -> serve index.html (SPA fallback)
  const extname = path.extname(pathname);
  if (!extname) {
    // Normalize to index.html for SPA client-side routing
    pathname = '/index.html';
  }

  console.log(`[serve-dist] After SPA fallback -> pathname=${pathname}`);

  // If running behind a reverse proxy or hosting under a subpath (e.g., /dashboard),
  // strip the base path from the incoming request so we serve the correct static
  // file from the dist directory. We assume VITE_BASE_PATH was used during
  // the build to prefix asset links.
  if (normalizedBase !== '/' && (pathname === normalizedBase.slice(0, -1) || pathname.startsWith(normalizedBase))) {
    if (pathname === normalizedBase.slice(0, -1)) {
      // Example: base '/dashboard' and request '/dashboard' -> serve '/index.html'
      pathname = '/';
    } else {
      // Remove the base prefix, keep the leading slash for the remaining path.
      pathname = '/' + pathname.slice(normalizedBase.length);
    }
  }

  // Construct the file path (ensure we don't treat absolute paths as root paths)
  const safePath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  let filePath = path.join(DIST_DIR, safePath);

  // Normalize and prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(DIST_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check if file exists
  console.log(`[serve-dist] checking exist: filePath=${filePath}, resolved=${resolved}, exists=${fs.existsSync(resolved)}`);
  fs.stat(resolved, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // If 404, try index.html (for SPA routing)
        filePath = path.join(DIST_DIR, 'index.html');
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
      }
      return;
    }

    // If it's a directory, return index.html
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          console.warn(`[serve-dist] 404 -> ${req.url} (tried: ${filePath || resolved})`);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        console.log(`[serve-dist] 200 OK -> ${req.url} -> ${filePath}`);
        res.end(data);
      });
      return;
    }

    // Read and serve the file
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
        return;
      }

      // Determine content type
      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      console.log(`[serve-dist] 200 OK -> ${req.url} -> ${resolved}`);
      res.end(data);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] ✅ Server listening at http://0.0.0.0:${PORT}`);
  console.log(`[server] ✅ Client ready at http://localhost:${PORT}`);
  console.log(`[server] Backend API should be at http://localhost:4000/api/...`);
});

server.on('error', (err) => {
  console.error(`[server] Error: ${err.message}`);
  process.exit(1);
});
