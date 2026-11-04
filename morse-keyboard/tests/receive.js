// Receive test: a second emulated station sends, its transmitter key line is wired to this station's cassette input.
// The receive routine only works with this program's own sending rhythm (short gaps inside a letter), so the sender is
// the same program. The receiver spends the first tones learning dit/dah lengths, so every message starts with a V.
// It also prints a blank about 35 ms after every letter (the word-gap loop at R18 has no keyboard poll in it), so the
// comparison ignores blanks.
const H = require('./harness.js');
function link(text, txWpm, rxWpm) {
  const rx = H.newMachine(), tx = H.newMachine(), wire = H.link(rx, tx);
  wire.runSeconds(0.3); rx.typeText('S'); tx.typeText('S'); wire.runSeconds(0.3);
  rx.typeText(String(rxWpm)); rx.pressKey(H.ENTER); tx.typeText(String(txWpm)); tx.pressKey(H.ENTER); wire.runSeconds(0.5);
  tx.pressKey(H.UP); wire.runSeconds(0.3);
  tx.typeText('V' + text); wire.runSeconds(0.2); tx.pressKey(H.ENTER);
  wire.runSeconds(6 + text.length * 14 * 1.2 / txWpm);
  return rx.screenText();
}
let fail = 0;
for (const [txw, rxw, text] of [[20, 20, 'CQ CQ DE W6XYZ'], [12, 12, 'THE QUICK BROWN FOX'], [20, 20, 'TEST 123 @ +'], [30, 30, 'PARIS PARIS'], [15, 20, 'HELLO WORLD']]) {
  const rows = link(text, txw, rxw);
  const got = rows.slice(1, 8).join('').replace(/\s+/g, '');
  const ok = got === text.replace(/\s+/g, '');
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', 'tx ' + txw + ' rx ' + rxw, JSON.stringify(text), '-> rx screen:', JSON.stringify(got));
}
process.exit(fail ? 1 : 0);
