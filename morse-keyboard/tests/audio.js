// Feed recordings (through real mp3 / aac encode+decode) to the program's cassette input via the zero-crossing shim.
const H = require('./harness.js'), A = require('./audiolib.js');
function station(wpm) { const m = H.newMachine(); H.startAt(m, wpm); return m; }
function listen(pcm, wpm, raw) {
  const m = station(wpm); m.setAudioInput(pcm, A.RATE, m.cpu.cycles, raw ? null : H.AudioIn.detect(pcm, A.RATE).key);
  m.runSeconds(pcm.length / A.RATE + 0.5);
  return {screen: m.screenText().slice(1, 8).join('').replace(/\s+/g, ' ').trim(), m};
}
// a recording made from this program's own transmitter (so it uses the rhythm the receiver was built for)
function ownKeying(text, wpm) {
  const tx = H.newMachine(); H.startAt(tx, wpm); tx.pressKey(H.UP); tx.runSeconds(0.3);
  const t0 = tx.cpu.cycles; tx.typeText(text); tx.pressKey(H.ENTER); tx.runSeconds(3 + text.length * 14 * 1.2 / wpm);
  return {keying: tx.relayEvents.map(e => [e[0] - t0, e[1]]), cps: tx.CPS};
}
let fail = 0;
function report(name, got, want) { const ok = got.replace(/ /g, '') === want.replace(/ /g, ''); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name, '->', JSON.stringify(got)); }
const ref = H.newMachine();
for (const codec of ['mp3', 'aac']) {
  const own = ownKeying('VCQ CQ DE W6XYZ', 20);
  report('own rhythm 20wpm via ' + codec, listen(A.viaCodec(A.tone(own.keying, own.cps), codec), 20).screen, 'CQCQDEW6XYZ');
  const noisy = A.tone(own.keying, own.cps, {noise: 0.15});
  report('own rhythm + noise via ' + codec, listen(A.viaCodec(noisy, codec), 20).screen, 'CQCQDEW6XYZ');
}
for (const f of [600, 700, 1000, 1500]) {
  const own = ownKeying('VCQ CQ DE W6XYZ', 20);
  report('own rhythm ' + f + ' Hz noisy via mp3', listen(A.viaCodec(A.tone(own.keying, own.cps, {freq: f, noise: 0.2}), 'mp3'), 20).screen, 'CQCQDEW6XYZ');
}
const own2 = ownKeying('VCQ CQ DE W6XYZ', 20);
console.log('INFO raw zero-crossing comparator, 700 Hz via mp3 ->', JSON.stringify(listen(A.viaCodec(A.tone(own2.keying, own2.cps), 'mp3'), 20, true).screen));
const std = ref.keyingFor('VVV CQ CQ DE W6XYZ', 15, 0);
const r = listen(A.viaCodec(A.tone(std, ref.CPS), 'mp3'), 15);
console.log('INFO standard 1:3:7 timing 15wpm via mp3 ->', JSON.stringify(r.screen));
process.exit(fail ? 1 : 0);
