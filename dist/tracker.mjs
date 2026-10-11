// Connected component detection at reduced resolution; coordinates are normalized.
// Pixels are grouped by 8-connectivity, then matched between frames by predicted centers.
export class BlobTracker {
  constructor() { this.reset(); }
  reset() { this.tracks = []; this.nextId = 1; this.background = null; this.width = 0; this.height = 0; }
  detect(rgba, width, height, options) {
    const size = width * height;
    if (this.width !== width || this.height !== height) {
      this.reset(); this.width = width; this.height = height;
      this.mask = new Uint8Array(size); this.work = new Uint8Array(size); this.queue = new Int32Array(size);
    }
    const mask = this.mask, threshold = options.threshold;
    if (options.mode === 'motion' && !this.background) {
      this.background = new Float32Array(size * 3);
      for (let i = 0; i < size; i++) for (let k = 0; k < 3; k++) this.background[i * 3 + k] = rgba[i * 4 + k];
    }
    for (let i = 0; i < size; i++) {
      const p = i * 4;
      if (options.mode === 'motion') {
        let diff = 0;
        for (let k = 0; k < 3; k++) {
          const b = i * 3 + k;
          diff += Math.abs(rgba[p + k] - this.background[b]);
          // Slow adaptation avoids turning a moving subject into a permanent trail.
          if (options.advance) this.background[b] += (rgba[p + k] - this.background[b]) * 0.006;
        }
        mask[i] = diff / 3 > threshold ? 1 : 0;
      } else {
        const luminance = rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722;
        mask[i] = (options.mode === 'dark' ? luminance < threshold : luminance > threshold) ? 1 : 0;
      }
    }
    // A one-pixel closing bridges small compression gaps without erasing fine blobs.
    if (options.close !== false) {
      this.work.fill(0);
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const p = y * width + x;
        this.work[p] = mask[p] | mask[p-1] | mask[p+1] | mask[p-width] | mask[p+width];
      }
      mask.fill(0);
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const p = y * width + x, b = this.work;
        mask[p] = b[p] & b[p-1] & b[p+1] & b[p-width] & b[p+width];
      }
    }
    this.work.set(mask); // Preserve the mask for preview while visiting components.
    const visited = this.work, blobs = [], queue = this.queue;
    const minArea = options.minArea * (Math.max(width,height) / 384) ** 2;
    for (let seed = 0; seed < size; seed++) {
      if (!visited[seed]) continue;
      let start = 0, end = 1, area = 0, sx = 0, sy = 0;
      let minX = width, maxX = 0, minY = height, maxY = 0;
      queue[0] = seed; visited[seed] = 0;
      while (start < end) {
        const p = queue[start++], x = p % width, y = (p / width) | 0;
        area++; sx += x; sy += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const n = ny * width + nx;
          if (visited[n]) { visited[n] = 0; queue[end++] = n; }
        }
      }
      if (area < minArea || area > size * 0.7) continue;
      blobs.push({ x: (minX - 2) / width, y: (minY - 2) / height,
        w: (maxX - minX + 5) / width, h: (maxY - minY + 5) / height,
        cx: sx / area / width, cy: sy / area / height, area: area / size });
    }
    blobs.sort((a,b) => b.area - a.area);
    return blobs.slice(0, options.maxBlobs);
  }
  update(blobs, smoothing = 0.35, advance = true) {
    const pairs = [];
    for (let t = 0; t < this.tracks.length; t++) {
      const track = this.tracks[t];
      for (let b = 0; b < blobs.length; b++) {
        const blob = blobs[b];
        const dist = Math.hypot(track.cx + track.vx - blob.cx, track.cy + track.vy - blob.cy);
        const areaPenalty = Math.abs(Math.log(Math.max(blob.area,1e-7) / Math.max(track.area,1e-7))) * 0.02;
        if (dist < 0.18) pairs.push({ t, b, score: dist + areaPenalty });
      }
    }
    pairs.sort((a,b) => a.score - b.score);
    const usedTracks = new Set(), usedBlobs = new Set();
    for (const {t,b} of pairs) {
      if (usedTracks.has(t) || usedBlobs.has(b)) continue;
      const track = this.tracks[t], blob = blobs[b];
      usedTracks.add(t); usedBlobs.add(b);
      const k = 1 - smoothing, oldX = track.cx, oldY = track.cy;
      for (const key of ['x','y','w','h','cx','cy']) track[key] += (blob[key] - track[key]) * k;
      if (advance) {
        track.vx = (track.cx - oldX) * 0.6 + track.vx * 0.4;
        track.vy = (track.cy - oldY) * 0.6 + track.vy * 0.4;
        track.history.push([track.cx,track.cy]);
        if (track.history.length > 40) track.history.shift();
      }
      track.area = blob.area; track.missed = 0;
    }
    if (advance) this.tracks.forEach((track,t) => { if (!usedTracks.has(t)) track.missed++; });
    for (let b = 0; b < blobs.length; b++) if (!usedBlobs.has(b)) {
      this.tracks.push({ ...blobs[b], id: this.nextId++, vx: 0, vy: 0, missed: 0, history: [[blobs[b].cx,blobs[b].cy]] });
    }
    this.tracks = this.tracks.filter(track => track.missed < 9);
    return this.tracks.filter(track => track.missed === 0).sort((a,b) => a.id - b.id);
  }
}

// Pick a threshold from this frame rather than assuming all clips have demo contrast.
export function tuneDetection(rgba,width,height,minArea=80,maxBlobs=20) {
  const histogram = new Uint32Array(256),size=width*height;
  let sum=0;
  for(let p=0;p<rgba.length;p+=4){const l=Math.round(rgba[p]*.2126+rgba[p+1]*.7152+rgba[p+2]*.0722);histogram[l]++;sum+=l;}
  let lowSum=0,lowCount=0,bestVariance=-1,otsu=150;
  for(let l=0;l<255;l++){
    lowCount+=histogram[l];lowSum+=histogram[l]*l;
    const highCount=size-lowCount;if(!lowCount||!highCount)continue;
    const variance=lowCount*highCount*(lowSum/lowCount-(sum-lowSum)/highCount)**2;
    if(variance>bestVariance){bestVariance=variance;otsu=l;}
  }
  const quantile=q=>{let n=0;for(let l=0;l<256;l++){n+=histogram[l];if(n>=size*q)return l;}return 255;};
  let best={mode:'bright',threshold:150,count:0,score:-Infinity};
  if(quantile(.99)-quantile(.01)<3 && bestVariance<=0)return best;
  for(const mode of ['bright','dark']) {
    const candidates=mode==='bright'?[otsu+1,quantile(.7),quantile(.88)]:[otsu+1,quantile(.3),quantile(.12)];
    for(const candidate of new Set(candidates)) {
      const threshold=Math.max(5,Math.min(250,candidate));
      const detector=new BlobTracker();
      const blobs=detector.detect(rgba,width,height,{mode,threshold,minArea,maxBlobs,advance:false});
      const useful=blobs.filter(b=>b.area<.45 && b.w*b.h<.75);
      const coverage=useful.reduce((n,b)=>n+b.area,0);
      const score=useful.length?Math.min(useful.length,12)*2+Math.min(coverage,.3)*10-(blobs.length-useful.length)*3:-Infinity;
      if(score>best.score)best={mode,threshold,count:useful.length,score};
    }
  }
  return best;
}

export function connectionEdges(tracks) {
  const edges = [], keys = new Set();
  tracks.forEach((track,i) => {
    const nearest = tracks.map((other,j) => ({ j, d: Math.hypot(track.cx-other.cx,track.cy-other.cy) }))
      .filter(n => n.j !== i && n.d < 0.65).sort((a,b) => a.d-b.d).slice(0,2);
    for (const {j} of nearest) {
      const key = [Math.min(i,j),Math.max(i,j)].join('-');
      if (!keys.has(key)) { keys.add(key); edges.push([i,j]); }
    }
  });
  return edges;
}
