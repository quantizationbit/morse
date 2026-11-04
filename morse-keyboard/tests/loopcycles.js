// Cycles per pass of each timing loop, measured between successive visits to a label. "Without POLCAT" subtracts the stub's cost
// (the real Color BASIC routine is the one unknown; everything else is the printed code on the 6809 cycle table).
const H = require('./harness.js');
function visits(m, pcs, seconds, setup) {
  const t = {}; pcs.forEach(p => t[p] = []);
  const step = m.cpu.step.bind(m.cpu);
  m.cpu.step = function () { if (t[m.cpu.pc]) t[m.cpu.pc].push(m.cpu.cycles); return step(); };
  setup(); m.runSeconds(seconds); m.cpu.step = step; return t;
}
function stats(a) { const d = []; for (let i = 1; i < a.length; i++) d.push(a[i] - a[i - 1]); d.sort((x, y) => x - y); return d.length ? d[d.length >> 1] : null; }
const delay = H.newMachine().POLLDELAY, stub = 6 + 2 + 5 * delay + 6 + 5 + 5;   // PSHS B, LDB, DECB/BNE x n, PULS B, LDA, RTS (approx; last BNE is 3)
const S = H.game.syms;
console.log('POLCAT stub delay', delay, '=> stub about', stub, 'cycles (incl. RTS). A JSR [POLCAT] adds ~8 more.');
// transmit loops
let m = H.newMachine(); let t = visits(m, [S.L24, S.CD2, S.L27], 6, () => { H.startAt(m, 20); m.pressKey(H.UP); m.runSeconds(0.2); m.typeText('EE'); m.pressKey(H.ENTER); });
console.log('SOUND tone loop L24   :', stats(t[S.L24]), 'cycles/pass (TVAL passes = one dit)');
console.log('CDLY delay loop CD2   :', stats(t[S.CD2]), 'cycles/pass');
console.log('SOUND gap loop L27    :', stats(t[S.L27]), 'cycles/pass');
// receive loops: wait-for-tone R1 (idle, polls), tone count R2/R12 (polls), tight debounce R50 and R60, tight word-gap R18
m = H.newMachine();
const keying = m.keyingFor('VVV', 20, 0.5);
t = visits(m, [S.R1, S.R2, S.R12, S.R50, S.R60, S.R18, S.R14, S.R87], 4, () => { H.startAt(m, 20); m.setSignal(m.cpu.cycles, keying); });
for (const n of ['R87', 'R1', 'R2', 'R12', 'R14']) console.log(n.padEnd(4), 'loop (polls keyboard):', stats(t[S[n]]), 'cycles/pass');
for (const n of ['R50', 'R60', 'R18']) console.log(n.padEnd(4), 'loop (tight)         :', stats(t[S[n]]), 'cycles/pass');
