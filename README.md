# Blob Tracker Studio

A browser tool for a TouchDesigner-style blob tracking overlay. Drop in a video, tune detection, and export boxes, persistent IDs, center points, connections and trails.

## Run locally

From this directory, run `node server.mjs`, then open http://127.0.0.1:5173. No dependencies or API keys are needed.

## Use

1. Upload or drag in a browser-compatible video.
2. Select Bright areas, Dark areas, or Moving areas. Motion detection works best with a static camera.
3. Open Detection mask and tune Threshold / Minimum blob size.
4. Adjust the overlay, then export video or save a PNG frame.

Processing stays on the device. Video export runs at playback speed using the browser's MediaRecorder encoder, at 30 FPS. Keep the tab visible. The app offers MP4 if the browser supports it, otherwise WebM. Original audio is included through Web Audio when enabled. Export resolution can be 720p, 1080p, or original up to 4K, without upscaling the source.

Detection uses luminance or background difference, connected components, and centroid matching. It is an artistic effect, not semantic object recognition. IDs can change on occlusion, overlap, large cuts or sudden motion. Higher Detection detail improves small blobs at the cost of processing speed.

The built-in animated demo runs through the same detector as uploaded footage. There was no original reference clip in the project; this implements the requested boxes + IDs + connecting lines look.

## Verification

`node --test tracker.test.mjs` checks detection, motion, noise filtering and ID matching. `node --check dist/app.js` checks app syntax.
