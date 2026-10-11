import { readFile, writeFile } from 'node:fs/promises';

// Development packaging only. The generated HTML runs without Node or a server.
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [template, css, tracker, media, app, worker] = await Promise.all([
  read('./dist/index.html'), read('./dist/style.css'), read('./dist/tracker.mjs'),
  read('./dist/media.mjs'), read('./dist/app.js'), read('./dist/conversion-worker.js')
]);
const withoutExports = source => source.replace(/^export\s+/gm, '');
const withoutImports = source => source.replace(/^import\s+.*?;\r?\n/gm, '');
const safeScript = source => source.replace(/<\/script/gi, '<\\/script');
const script = [withoutExports(tracker), withoutExports(media), withoutImports(app)].join('\n\n');
const stylesheetTag = '<link rel="stylesheet" href="./style.css">';
const appTag = '<script type="module" src="./app.js"></script>';
if (!template.includes(stylesheetTag) || !template.includes(appTag)) {
  throw new Error('The page entrypoints changed; update the standalone packager.');
}
const html = template
  .replace(stylesheetTag, () => `<style>\n${css}\n</style>`)
  .replace('href="./" aria-label="Blob Tracker home"', 'href="#" aria-label="Blob Tracker home"')
  .replace(appTag, () => `<script id="conversionWorkerSource" type="text/plain">\n${safeScript(worker)}\n</script>\n<script type="module">\n${safeScript(script)}\n</script>`);
await writeFile(new URL('./blob-tracker.html', import.meta.url), html);
console.log(`Built blob-tracker.html (${(Buffer.byteLength(html)/1024).toFixed(1)} KB). Open it directly in Chrome or Edge.`);
