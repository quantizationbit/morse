// Real on-air recording -> pitch correct with ffmpeg (asetrate + atempo, timing preserved) -> program's cassette input.
// usage: node tests/onair.js file.mp3 startSec lengthSec targetHz [wpm] [raw]
const {execFileSync} = require('child_process'), H = require('./harness.js'), AI = H.AudioIn;
const [file, start, len, target, wpm, raw] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], +(process.argv[6] || 30), process.argv[7] === 'raw'];
const RATE = 8000;
function load(extra) {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(start), '-t', String(len), '-i', file, '-ac', '1', '-ar', String(RATE), ...extra, '-f', 'f32le', '-'], {maxBuffer: 1 << 29});
  return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.length));
}
// TEMPO=0.5 slows the recording to half speed (plain resample, so the tone drops too); then a heterodyne shift puts the tone at targetHz.
const tempo = +(process.env.TEMPO || 1);
let pcm = load(tempo === 1 ? [] : ['-af', 'asetrate=' + Math.round(RATE * tempo) + ',aresample=' + RATE]);
const f0 = AI.findTone(pcm, RATE, 150), orig = pcm;
pcm = require('../src/freqshift.js').frequencyShift(pcm, RATE, target - f0);
// start the way a real session does: after a word gap, with silence ahead (the program learns dit/dah once, from the first tones)
function startAfterWordGap(p) {
  const d = AI.detect(p, RATE), runs = []; let cur = d.key[0], n = 0, pos = 0;
  for (const k of d.key) { if (k === cur) n++; else { runs.push([cur, n, pos - n]); cur = k; n = 1; } pos++; }
  const tones = runs.filter(r => r[0] && r[1] > 0.012 * RATE).map(r => r[1]).sort((a, b) => a - b), dit = tones[Math.floor(tones.length * 0.2)];
  const gap = runs.find(r => !r[0] && r[1] > 5 * dit && r[2] > 0.5 * RATE);
  if (!gap) return p;
  const from = gap[2] + gap[1] - Math.round(0.15 * RATE);                       // keep 150 ms of the gap as lead-in
  const out = new Float32Array(Math.round(1.5 * RATE) + p.length - from); out.set(p.subarray(from), Math.round(1.5 * RATE));
  return out;
}
if (!process.env.NOTRIM) pcm = startAfterWordGap(pcm);
const f1 = AI.findTone(pcm, RATE, 150);
console.log(`tone ${f0} Hz -> ${f1} Hz (wanted ${target}); tempo ${tempo}; ${(orig.length / RATE).toFixed(1)} s in, ${(pcm.length / RATE).toFixed(1)} s out`);
if (process.env.RUNS) { const d = AI.detect(pcm, RATE), runs = []; let cur = d.key[0], n = 0;
  for (const k of d.key) { if (k === cur) n++; else { runs.push((cur ? '#' : '_') + Math.round(n / RATE * 1000)); cur = k; n = 1; } }
  console.log('first runs (# tone, _ gap, ms):', runs.slice(0, +process.env.RUNS).join(' ')); }
const m = H.newMachine(); H.startAt(m, wpm);
const det = raw ? null : AI.detect(pcm, RATE);
m.setAudioInput(pcm, RATE, m.cpu.cycles, det ? det.key : null);
m.runSeconds(pcm.length / RATE + 1);
const rows = m.screenText(), S0 = m.syms;
const S = m.syms, w = n => (m.ram[S[n]] << 8) | m.ram[S[n] + 1];
console.log('mode:', raw ? 'raw zero-crossing' : 'tone decoder');
console.log('learned (loop counts): T1', w('T1'), 'T2', w('T2'), 'TMID', w('TMID'), 'TF', w('TF'), 'T3', w('T3'), 'TSP', w('TSP'), 'FLAG', m.ram[S.FLAG]);
console.log(rows.slice(0, 8).join('\n'));
