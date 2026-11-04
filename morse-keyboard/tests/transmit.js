// Transmit test: type text, send it, decode the relay (key line) timing back into text, and report element timing.
const H = require('./harness.js');
const MORSE = {}; // built from the program's own TABLE, so it is the decoder's view of what was sent
function decodeRelay(m, events) {
  const dit = 1.2 / m.wpm * m.CPS;
  const els = []; // {on, dur, gapBefore}
  let on = null, lastOff = null;
  for (const [c, lvl] of events) {
    if (lvl) { on = c; } else if (on !== null) { els.push({dur: c - on, gap: lastOff === null ? Infinity : on - lastOff}); lastOff = c; on = null; }
  }
  return {els, dit};
}
function run(wpm, text) {
  const m = H.newMachine(); m.wpm = wpm; H.startAt(m, wpm);
  m.pressKey(H.UP); m.runSeconds(0.3); m.typeText(text); m.runSeconds(0.3); m.pressKey(H.ENTER);
  m.runSeconds(2 + text.length * 1.2 * 12 / wpm);
  const {els, dit} = decodeRelay(m, m.relayEvents);
  // reverse table: code string -> char
  const rev = {};
  for (let a = 0x20; a < 0x60; a++) { const ch = String.fromCharCode(a), c = m.morseFor(ch); if (c) rev[c] = ch; }
  let out = '', cur = '';
  const thr = 2 * dit;   // elements shorter than this count as dits
  // three gap classes: inside a letter, between letters, between words
  const gaps = els.slice(1).map(e => e.gap).sort((a, b) => a - b);
  const small = gaps[0], big = gaps[gaps.length - 1];
  const letterBreak = 2.5 * small;
  const letters = gaps.filter(g => g > letterBreak), L = letters.length ? letters[0] : big;
  for (let i = 0; i < els.length; i++) {
    if (i && els[i].gap > letterBreak) { out += rev[cur] || '?'; cur = ''; if (els[i].gap > 1.8 * L) out += ' '; }
    cur += els[i].dur > thr ? '-' : '.';
  }
  out += rev[cur] || '?';
  const ditsD = els.filter(e => e.dur <= thr).map(e => e.dur / m.CPS * 1000), dahsD = els.filter(e => e.dur > thr).map(e => e.dur / m.CPS * 1000);
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  return {out, dit: avg(ditsD), dah: avg(dahsD), elementGap: (small / m.CPS * 1000).toFixed(1), letterGap: (L / m.CPS * 1000).toFixed(1), wordGap: (big / m.CPS * 1000).toFixed(1), nominalDit: (1000 * 1.2 / wpm).toFixed(1), screen: m.screenText()};
}
let fail = 0;
for (const [wpm, text] of [[20, 'CQ DE W6XYZ'], [12, 'THE QUICK BROWN FOX'], [30, 'TEST 123 @ + < >'], [20, 'PARIS']]) {
  const r = run(wpm, text);
  const ok = r.out.replace(/\s+/g, ' ').trim() === text;
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL'), wpm + ' WPM', JSON.stringify(text), '->', JSON.stringify(r.out), '| dit', r.dit, 'ms (nominal', r.nominalDit + ') dah', r.dah, 'elem gap', r.elementGap, 'letter gap', r.letterGap, 'word gap', r.wordGap);
}
process.exit(fail ? 1 : 0);
