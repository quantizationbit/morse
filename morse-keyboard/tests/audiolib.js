// Make test recordings: synthesize Morse tones, encode with ffmpeg (mp3 / aac), decode back to PCM like the page would.
const {execFileSync} = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const RATE = 44100;
function tone(keying, cps, {freq = 700, noise = 0, lead = 1.0, tail = 3.0, seed = 1, wobble = 0} = {}) {
  // keying: [[cycleOffset, level]] from machine.keyingFor or a transmitter's relay events (offsets in cycles)
  const end = keying.length ? keying[keying.length - 1][0] / cps : 0, n = Math.ceil((lead + end + tail) * RATE);
  const pcm = new Float32Array(n); let ki = 0, level = 0, env = 0, ph = 0, r = seed;
  const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296 - 0.5; };
  for (let i = 0; i < n; i++) {
    const t = i / RATE - lead;
    while (ki < keying.length && keying[ki][0] / cps <= t) level = keying[ki++][1];
    env += ((level ? 1 : 0) - env) * 0.02;                 // ~1 ms attack/release, no key clicks
    ph += (freq + wobble * Math.sin(2 * Math.PI * 3.1 * i / RATE)) / RATE; if (ph >= 1) ph -= 1;
    pcm[i] = Math.sin(ph * 2 * Math.PI) * 0.5 * env + noise * rnd();
  }
  return pcm;
}
function viaCodec(pcm, codec) {                              // codec: 'mp3' | 'aac'
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morse-')), raw = path.join(dir, 'in.f32'), enc = path.join(dir, codec === 'mp3' ? 'a.mp3' : 'a.m4a');
  fs.writeFileSync(raw, Buffer.from(pcm.buffer));
  const q = codec === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '64k'] : ['-c:a', 'aac', '-b:a', '48k'];
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', raw, ...q, enc]);
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', enc, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], {maxBuffer: 1 << 28});
  fs.rmSync(dir, {recursive: true});
  return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.length));
}
module.exports = {RATE, tone, viaCodec};
