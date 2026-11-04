// Analyze a recording: tone pitch, loudness, and the keyed element lengths (for an estimate of speed).
const {execFileSync} = require('child_process'), AI = require('../src/audioin.js');
const file = process.argv[2], from = +process.argv[3] || 0, len = +process.argv[4] || 60, RATE = 8000;
const out = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(from), '-t', String(len), '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], {maxBuffer: 1 << 28});
const pcm = new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.length));
let rms = 0; for (const v of pcm) rms += v * v; rms = Math.sqrt(rms / pcm.length);
const f = AI.findTone(pcm, RATE), d = AI.detect(pcm, RATE);
const runs = []; let cur = d.key[0], n = 0;
for (const k of d.key) { if (k === cur) n++; else { runs.push([cur, n / RATE * 1000]); cur = k; n = 1; } }
const on = runs.filter(r => r[0] && r[1] > 15).map(r => r[1]).sort((a, b) => a - b), off = runs.filter(r => !r[0] && r[1] > 15).map(r => r[1]).sort((a, b) => a - b);
const med = a => a.length ? a[a.length >> 1] : 0, q = (a, p) => a.length ? a[Math.floor(a.length * p)] : 0;
console.log({window: from + 's+' + len + 's', rms: rms.toFixed(3), toneHz: f, tones: on.length, ditMsApprox: Math.round(q(on, 0.25)), dahMsApprox: Math.round(q(on, 0.85)), shortGapMs: Math.round(q(off, 0.25)), longGapMs: Math.round(q(off, 0.85)), wpmApprox: q(on, 0.25) ? (1200 / q(on, 0.25)).toFixed(1) : null});
