/* Tiny static preview server for the ISNP Lab site.
   Run from the site root:  node tools/serve.js [port]   (default 8000)
   Then open the printed http://localhost:<port>/ URL. Ctrl+C to stop. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname);            // tools/ -> site root
const port = parseInt(process.argv[2], 10) || 8000;
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.eot': 'application/vnd.ms-fontobject',
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.join(ROOT, p);
  try { if (fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html'); } catch (e) {}
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found: ' + p); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, () => console.log(`Serving ${ROOT}\n  http://localhost:${port}/`));
