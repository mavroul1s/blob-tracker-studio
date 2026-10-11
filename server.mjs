import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webm':'video/webm', '.mp4':'video/mp4' };
const server = http.createServer((req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(root,relative);
    if (!target.startsWith(root+path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404);res.end('Not found');return; }
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(target).pipe(res);
  } catch { res.writeHead(400);res.end('Bad request'); }
});
server.listen(Number(process.env.PORT)||5173,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}`));
