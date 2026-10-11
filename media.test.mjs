import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVideoFrame} from './dist/media.mjs';
test('audio-only decoding is rejected even after loadeddata',()=>{
  assert.throws(()=>validateVideoFrame({videoWidth:0,videoHeight:0,duration:13.5,readyState:4}),error=>error.code==='VIDEO_CODEC');
});
test('valid video frames are accepted and undecoded frames rejected',()=>{
  assert.doesNotThrow(()=>validateVideoFrame({videoWidth:1920,videoHeight:1080,duration:13.5,readyState:2}));
  assert.throws(()=>validateVideoFrame({videoWidth:1920,videoHeight:1080,duration:13.5,readyState:1}),/not decoded/);
});
