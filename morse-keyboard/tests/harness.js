// Shared headless setup: build the machine from build/game.json and drive it like the page does.
const fs = require('fs'), path = require('path');
const CPU = require(path.join(__dirname, '../src/cpu6809_core.js'));
const Machine = require(path.join(__dirname, '../src/machine.js'));
const CYC = require(path.join(__dirname, '../src/cyc.json'));
const VARIANT = process.env.MORSE_VARIANT ? '_' + process.env.MORSE_VARIANT : '';      // MORSE_VARIANT=patched runs the patched listing
const game = JSON.parse(fs.readFileSync(path.join(__dirname, '../build/game' + VARIANT + '.json')));
const cal = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../build/calibration.json'))); } catch (e) { return {pollDelay: 100}; } })();
function newMachine(pollDelay) {
  const m = new Machine(CPU, CYC, game, {pollDelay: pollDelay === undefined ? cal.pollDelay : pollDelay});
  m.boot(); return m;
}
// Start the program the way a user would: press S on the instruction screen, enter the speed.
function startAt(m, wpm) {
  m.runSeconds(0.3); m.typeText('S'); m.runSeconds(0.3);
  m.typeText(String(wpm)); m.pressKey(13); m.runSeconds(0.5);
}
const UP = 0x5E, DOWN = 0x0A, LEFT = 8, RIGHT = 9, BREAK = 3, CLEAR = 12, ENTER = 13;
const AudioIn = require(path.join(__dirname, '../src/audioin.js'));
const link = (a, b) => Machine.link(a, b);
module.exports = {AudioIn, link, newMachine, startAt, UP, DOWN, LEFT, RIGHT, BREAK, CLEAR, ENTER, game};
