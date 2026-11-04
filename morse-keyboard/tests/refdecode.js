// Independent reference decoder for a recording: the same tone detector, then ordinary adaptive Morse timing.
// If this reads as English the detector output is sound, so any remaining garble comes from the program under test.
const {execFileSync} = require('child_process'), AI = require('../src/audioin.js');
const [file, start, len] = [process.argv[2], +process.argv[3], +process.argv[4]], RATE = 8000;
const out = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(start), '-t', String(len), '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], {maxBuffer: 1 << 28});
const pcm = new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.length));
const d = AI.detect(pcm, RATE), runs = []; let cur = d.key[0], n = 0;
for (const k of d.key) { if (k === cur) n++; else { runs.push([cur, n / RATE * 1000]); cur = k; n = 1; } }
const CODE = {'.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y', '--..': 'Z', '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9', '.-.-.-': '.', '--..--': ',', '..--..': '?', '-..-.': '/', '-...-': '='};
const tones = runs.filter(r => r[0] && r[1] >= 12).map(r => r[1]).sort((a, b) => a - b);
const dit = tones[Math.floor(tones.length * 0.2)];            // short-tone estimate
let text = '', sym = ''; const ons = runs.filter(r => r[1] >= 12 || !r[0]);
for (const [on, ms] of runs) {
  if (on) { if (ms >= 12) sym += ms > 2 * dit ? '-' : '.'; }
  else if (ms > 2.2 * dit) { text += (CODE[sym] || (sym ? '*' : '')); sym = ''; if (ms > 5 * dit) text += ' '; }
}
console.log('dit ~', dit.toFixed(0), 'ms (', (1200 / dit).toFixed(0), 'wpm ), tones', tones.length);
console.log(text);
