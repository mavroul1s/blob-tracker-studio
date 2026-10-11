import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { randomUUID } from 'node:crypto';
const workspace = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(workspace, 'dist');
const jobsRoot = path.resolve(workspace,'.local-tools','jobs');
const binaries = path.join(workspace,'.local-tools','python','imageio_ffmpeg','binaries');
const ffmpeg = process.env.BLOB_TRACKER_FFMPEG || (fs.existsSync(binaries) ? fs.readdirSync(binaries).filter(n=>/^ffmpeg.*\.exe$/i.test(n)).map(n=>path.join(binaries,n))[0] : null);
const maxBytes = 1024*1024*1024;
let activeJob=false;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webm':'video/webm', '.mp4':'video/mp4' };
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function convert(req,res) {
  if(!ffmpeg||!fs.existsSync(ffmpeg)){json(res,503,{error:'The local video converter is not installed.'});return;}
  if(activeJob){json(res,409,{error:'Another video is converting. Please wait for it to finish.'});return;}
  if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`){json(res,403,{error:'Conversion must be requested from this local app.'});return;}
  if(Number(req.headers['content-length'])>maxBytes){json(res,413,{error:'Local conversion supports files up to 1 GB.'});return;}
  activeJob=true;
  const job=path.resolve(jobsRoot,randomUUID());
  if(!job.startsWith(jobsRoot+path.sep)){activeJob=false;json(res,500,{error:'Invalid conversion directory.'});return;}
  let child,timer,bytes=0;
  const disconnected=()=>{if(!res.writableFinished)child?.kill();};
  res.on('close',disconnected);
  try {
    await fs.promises.mkdir(job,{recursive:true});
    const input=path.join(job,'input'),output=path.join(job,'output.mp4');
    await pipeline(req,new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;callback(bytes>maxBytes?new Error('File exceeds the 1 GB conversion limit.'):null,chunk);}}),fs.createWriteStream(input));
    await new Promise((resolve,reject)=>{
      child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-i',input,'-map','0:v:0','-map','0:a:0?',
        '-vf','scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',output],{windowsHide:true});
      let detail='';child.stderr.on('data',chunk=>{detail=(detail+chunk).slice(-1500);});
      timer=setTimeout(()=>{child.kill();reject(new Error('Video conversion took too long.'));},240000);
      child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(detail.includes('matches no streams')?'This file has no video track.':'Could not convert this video. Use another original clip.')));
    });
    clearTimeout(timer);
    const stat=await fs.promises.stat(output);
    res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':stat.size,'Cache-Control':'no-store'});
    await pipeline(fs.createReadStream(output),res);
  } catch(error) {if(!res.headersSent&&!res.destroyed)json(res,422,{error:error.message});}
  finally {
    clearTimeout(timer);res.off('close',disconnected);child?.kill();
    // The resolved job must remain within the explicitly named local jobs directory.
    if(path.isAbsolute(job)&&job.startsWith(jobsRoot+path.sep))await fs.promises.rm(job,{recursive:true,force:true}).catch(()=>{});
    activeJob=false;
  }
}
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname==='/api/capabilities'){json(res,200,{convert:Boolean(ffmpeg&&fs.existsSync(ffmpeg)),maxUploadBytes:maxBytes});return;}
    if(url.pathname==='/api/convert'){if(req.method!=='POST'){json(res,405,{error:'Use POST.'});return;}await convert(req,res);return;}
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(root,relative);
    if (!target.startsWith(root+path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404);res.end('Not found');return; }
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(target).pipe(res);
  } catch { res.writeHead(400);res.end('Bad request'); }
});
server.requestTimeout=300000;
server.listen(Number(process.env.PORT)||5173,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}`));
