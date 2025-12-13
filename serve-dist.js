#!/usr/bin/env node

/**
 * Simple HTTP server to serve the built client on port 3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const BASE_PATH = process.env.VITE_BASE_PATH ?? '/';
// Normalize base path to always end with a slash, and ensure it starts with a slash.
const normalizedBase = (BASE_PATH.startsWith('/') ? BASE_PATH : '/' + BASE_PATH).replace(/([^/])$/, '$1/')
const DIST_DIR = path.join(__dirname, 'client/dist');

console.log(`[server] Starting client server on port ${PORT}`);
console.log(`[server] Serving files from: ${DIST_DIR}`);

const server = http.createServer((req, res) => {
  // Parse the URL
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  
  // Default to index.html for root
  if (pathname === '/') {
    pathname = '/index.html';
  }

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

  // Construct the file path
  let filePath = path.join(DIST_DIR, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
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
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
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
