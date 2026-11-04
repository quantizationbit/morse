// Is the sound the page plays in sync with what the program does? Pull audio the way the page does (one emulated field per audioFrame)
// and compare against the program's own key line, in emulated time.
const H = require('./harness.js'), A = require('./audiolib.js');
const RATE = 48000, SPF = RATE / 60;
function goertzel(x, f) { const w = 2 * Math.PI * f / RATE, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (const v of x) { const s = v + c * s1 - s2; s2 = s1; s1 = s; } return s1 * s1 + s2 * s2 - c * s1 * s2; }
let fail = 0; const check = (name, ok, extra) => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name, extra || ''); };

// 1b. (below) Transmit sidetone
// 1. Transmit: sound only while the relay (key line) is on, tone near the loop rate.
{
  const m = H.newMachine(); H.startAt(m, 20); m.pressKey(H.UP); m.runSeconds(0.3);
  m.typeText('CQ DE W6XYZ'); m.pressKey(H.ENTER);
  let on = 0, off = 0, onFrames = 0, offFrames = 0; const tone = [];
  for (let f = 0; f < 60 * 14; f++) {
    m.runFrame(); const s = m.audioFrame(RATE); let e = 0; for (const v of s) e += v * v;
    const t0 = m.frameStartCycle(), t1 = t0 + m.CPF;
    if (m.relayEvents.some(x => x[0] >= t0 && x[0] < t1)) continue;          // a key edge falls inside this field: skip it
    let level = 0; for (const [c, l] of m.relayEvents) if (c < t0) level = l;
    if (level) { on += e; onFrames++; if (tone.length < 48000) tone.push(...s); } else { off += e; offFrames++; }
  }
  check('transmit: silent while key is up', offFrames > 20 && off < 1e-4 * on, offFrames + ' frames, energy ' + off.toFixed(4) + ' vs ' + on.toFixed(1) + ' with key down');
  check('transmit: tone present while key is down', onFrames > 20 && on > 1, onFrames + ' frames');
  let best = 0, bf = 0; for (let f = 600; f <= 3000; f += 10) { const g = goertzel(tone, f); if (g > best) { best = g; bf = f; } }
  check('transmit: pitch near 1.17 kHz (one 766-cycle pass per cycle)', bf > 1100 && bf < 1250, bf + ' Hz');
}

// 2. Receive from a recording: the audio the page plays is the recording, aligned to the line the program reads.
{
  const own = (() => { const tx = H.newMachine(); H.startAt(tx, 20); tx.pressKey(H.UP); tx.runSeconds(0.3); const t0 = tx.cpu.cycles; tx.typeText('VCQ'); tx.pressKey(H.ENTER); tx.runSeconds(6); return {k: tx.relayEvents.map(e => [e[0] - t0, e[1]]), cps: tx.CPS}; })();
  const pcm = A.tone(own.k, own.cps, {freq: 1300}), key = H.AudioIn.detect(pcm, A.RATE).key;
  const m = H.newMachine(); H.startAt(m, 20); const start = m.cpu.cycles; m.setAudioInput(pcm, A.RATE, start, key);
  const out = [], starts = []; const seen = []; const step = m.cpu.step.bind(m.cpu); let reads = 0, mism = 0;
  m.cpu.step = function () { // every time the program samples $FF20, record (cycle, line level it got)
    if (m.cpu.pc === m.syms.R87 || m.cpu.pc === m.syms.R1) { const i = Math.floor((m.cpu.cycles - start) / m.CPS * A.RATE); if (i >= 0 && i < key.length) { reads++; if ((m.rd(0xFF20) & 1) !== (key[i] ? 0 : 1)) mism++; } }
    return step(); };
  for (let f = 0; f < 60 * (pcm.length / A.RATE); f++) { m.runFrame(); starts.push([out.length, m.frameStartCycle()]); out.push(...m.audioFrame(RATE)); }
  check('receive: line the program reads equals the detector key at the same instant', reads > 100 && mism === 0, reads + ' reads, ' + mism + ' mismatches');
  // each field's audio must be the recording at that field's own emulated instant, sample for sample (the page plays fields back to back)
  let err = 0, n = 0, sig = 0;
  for (const [at, fs] of starts.slice(20, 500)) for (let k = 0; k < SPF; k += 3) {
    const j = Math.floor((fs - start + k * m.CPF / SPF) / m.CPS * A.RATE), want = j >= 0 && j < pcm.length ? pcm[j] * 0.6 : 0, d = out[at + k] - want;
    err += d * d; sig += want * want; n++;
  }
  check('receive: every field plays the recording at its own emulated instant', n > 1000 && Math.sqrt(err / n) < 1e-4, 'rms error ' + Math.sqrt(err / n).toExponential(1) + ' vs signal ' + Math.sqrt(sig / n).toFixed(3));
  // the emulated clock runs a few cycles long per field (instructions overshoot the field boundary); the audio is cut from the same clock, so it stays in step
  const drift = (m.cpu.cycles - start) / m.CPS - out.length / RATE;
  check('receive: clock drift over the whole run under 5 ms', Math.abs(drift) < 0.005, (drift * 1000).toFixed(2) + ' ms over ' + (out.length / RATE).toFixed(1) + ' s');
}
// 1b. Transmit as a clean sidetone keyed by the relay: silent while key up, the chosen pitch while key down
{
  const m = H.newMachine(); m.txTone = 'sidetone'; m.tonePitch = 600; H.startAt(m, 20); m.pressKey(H.UP); m.runSeconds(0.3);
  m.typeText('CQ DE W6XYZ'); m.pressKey(H.ENTER);
  let on = 0, off = 0, onFrames = 0, offFrames = 0, edge = 0, edgeOn = 0; const tone = [];
  for (let f = 0; f < 60 * 14; f++) {
    m.runFrame(); const s = m.audioFrame(RATE); let e = 0; for (const v of s) e += v * v;
    const t0 = m.frameStartCycle(), t1 = t0 + m.CPF; let level = 0; for (const [c, l] of m.relayEvents) if (c < t0) level = l;
    if (m.relayEvents.some(x => x[0] >= t0 && x[0] < t1)) { edge++; continue; }
    if (level) { on += e; onFrames++; if (tone.length < 48000) tone.push(...s); } else { off += e; offFrames++; }
  }
  check('transmit sidetone: silent while key is up', offFrames > 20 && off < 1e-6, offFrames + ' frames, energy ' + off.toFixed(6));
  check('transmit sidetone: steady while key is down', onFrames > 20 && on / onFrames > 20, (on / onFrames).toFixed(1) + ' energy per field');
  let best = 0, bf = 0; for (let f = 400; f <= 1000; f += 5) { const g = goertzel(tone, f); if (g > best) { best = g; bf = f; } }
  check('transmit sidetone: pitch is the one chosen (600 Hz)', Math.abs(bf - 600) <= 10, bf + ' Hz');
}
process.exit(fail ? 1 : 0);
