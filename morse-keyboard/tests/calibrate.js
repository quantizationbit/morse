// Pick the POLCAT stub delay so a dit tone lasts 1.2/WPM seconds (what the printout's 1410 constant is tuned for).
// Prints the dit length and tone pitch for each candidate delay and writes build/calibration.json.
const fs = require('fs'), path = require('path');
const H = require('./harness.js');
function measure(delay, wpm) {
  const m = H.newMachine(delay); H.startAt(m, wpm);
  m.pressKey(H.UP); m.runSeconds(0.3); m.typeText('E'); m.runSeconds(0.2); m.pressKey(H.ENTER); m.runSeconds(2);
  const ev = m.relayEvents, on = ev.find(e => e[1] === 1), off = ev.find(e => e[1] === 0 && on && e[0] > on[0]);
  if (!on || !off) return null;
  return {ditMs: (off[0] - on[0]) / m.CPS * 1000, tval: m.ram[m.syms.TVAL] * 256 + m.ram[m.syms.TVAL + 1]};
}
let best = null;
for (const d of [60, 80, 100, 110, 120, 130, 140, 160]) {
  const r = measure(d, 20); if (!r) { console.log('delay', d, 'no tone'); continue; }
  console.log('delay', d, 'TVAL', r.tval, 'dit', r.ditMs.toFixed(1), 'ms (want 60.0)');
  if (!best || Math.abs(r.ditMs - 60) < Math.abs(best.ditMs - 60)) best = {pollDelay: d, ditMs: r.ditMs};
}
console.log('best so far', best);
