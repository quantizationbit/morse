// Minimal Color Computer for Bill's Morse keyboard: 64K RAM, stub ROM (POLCAT), PIA0/PIA1, VDG text state, 6-bit DAC capture,
// cassette-input line (the receive key line), and the cassette relay (the transmit key line).
function MorseCoCo(CPU6809, CYC, game, opts) {
  var m = this;
  opts = opts || {};
  var ram = m.ram = new Uint8Array(65536), rom = m.rom = new Uint8Array(65536);
  var CPF = 14916;                       // cycles per 60 Hz field (0.8949 MHz)
  var CPS = CPF * 60;                    // cycles per second
  m.CPF = CPF; m.CPS = CPS;

  // ---- stub ROM. The program calls Color BASIC's POLCAT through the vector at $A000 and runs it hundreds of times per
  // dit, so the speed of the whole program (sending speed, tone pitch, receive loop counts) depends on how long the real
  // routine took. The stub burns the same number of cycles (m.POLLDELAY loop count, calibrated by tests/calibrate.js).
  m.POLLDELAY = opts.pollDelay || 0;
  function romput(a, bytes) { for (var i = 0; i < bytes.length; i++) rom[a + i] = bytes[i]; }
  romput(0xA000, [0xA1, 0xC1]);                       // POLCAT entry pointer
  function installPolcat() {
    romput(0xA1C1, [0x34, 0x04,                       // PSHS B
                    0xC6, m.POLLDELAY & 255,          // LDB #delay
                    0x5A, 0x26, 0xFD,                 // L: DECB ; BNE L
                    0x35, 0x04,                       // PULS B
                    0xB6, 0xFF, 0x70,                 // LDA $FF70   (next key or 0, sets Z)
                    0x39]);                           // RTS
  }
  installPolcat();
  m.setPollDelay = function (n) { m.POLLDELAY = n; installPolcat(); };

  var pia0 = {cra: 0, crb: 0}, pia1 = {cra: 0, crb: 0};
  m.vdg = 0; m.dac = 32;
  m.keyQueue = [];
  m.events = [];       // DAC writes this frame: [cycle-in-frame, value]
  m.relay = false;     // $FF21 bit 3 (cassette motor relay) = the transmitter key line
  m.relayEvents = [];  // [absolute cycle, level] (tests and the lamp)
  m.relayFrame = [];   // relay changes inside the current field: [cycle-in-field, level]
  var relayAtStart = false;
  m.manualKey = false; // a human on the straight key
  var sched = [];      // received key state: [absolute cycle, 1 = key down], sorted (the line itself is active low)
  m.sigEvents = [];    // received-signal changes this frame (for the sidetone): [cycle-in-frame, level]
  var frameStart = 0;

  // Audio input shim: the cassette port is a zero-crossing comparator. While a recording plays, bit 0 of $FF20 is the sign of the
  // waveform at the CPU's current cycle (low half = 0, everything else, including silence, = 1 = idle).
  var aud = null;
  // key (optional): 1 per sample while a tone is present, from MorseAudioIn.detect. Without it the raw waveform sign is used.
  m.setAudioInput = function (pcm, rate, startCycle, key) { aud = pcm ? {pcm: pcm, rate: rate, start: startCycle, thr: 0.02, key: key || null} : null; };
  m.audioInputActive = function () { return aud !== null && m.cpu.cycles - aud.start < aud.pcm.length / aud.rate * CPS; };
  function compBit(c) {
    var i = Math.floor((c - aud.start) / CPS * aud.rate);
    if (i < 0 || i >= aud.pcm.length) return 1;
    return (aud.key ? !aud.key[i] : aud.pcm[i] >= -aud.thr) ? 1 : 0;
  }
  function sigAt(c) {
    if (aud) return compBit(c) ? 0 : 1;
    if (m.manualKey) return 1;
    var lo = 0, hi = sched.length - 1, r = 0;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (sched[mid][0] <= c) { r = sched[mid][1]; lo = mid + 1; } else hi = mid - 1; }
    return r;
  }
  m.sigAt = sigAt;
  // Replace the scheduled receive signal. keying = [[offsetCycles, level], ...] relative to startCycle.
  m.setSignal = function (startCycle, keying) {
    sched = keying.map(function (e) { return [startCycle + e[0], e[1]]; });
  };
  m.signalEnd = function () { return sched.length ? sched[sched.length - 1][0] : 0; };
  m.clearSignal = function () { sched = []; };
  // Live wire from another station: edges arrive in absolute cycles (both machines count from 0 in lockstep).
  m.addSignalEdge = function (cycle, level) {
    var n = sched.length;
    if (n && sched[n - 1][1] === level) return;
    sched.push([cycle, level]);
    if (n > 64) sched.splice(0, n - 32);     // keep the list short; only the recent past is ever read
  };

  function io(a, v, write) {
    if (a >= 0xFFE0) return rom[a];
    if (a >= 0xFF70 && a <= 0xFF72) return m.keyQueue.length && a === 0xFF70 ? m.keyQueue.shift() : 0;   // host key register
    var r = a & 3;
    if ((a & 0xFFE0) === 0xFF00) {               // PIA0 (keyboard; only the sound-mux control bits matter here)
      if (r === 0) return 0xFF;
      if (r === 1) { if (write) pia0.cra = v; return pia0.cra; }
      if (r === 2) return write ? 0 : 0xFF;
      if (write) pia0.crb = v;
      return pia0.crb;
    }
    if ((a & 0xFFE0) === 0xFF20) {               // PIA1
      if (r === 0) {
        if (write) { m.dac = (v >> 2) & 63; m.events.push([m.cpu.cycles - frameStart, m.dac]); return 0; }
        return aud ? compBit(m.cpu.cycles) : (sigAt(m.cpu.cycles) ? 0 : 1);      // bit 0 = cassette input: the receive key line, active low (IR = 255 is idle)
      }
      if (r === 1) {
        if (write) {
          var was = m.relay; pia1.cra = v; m.relay = (v & 8) !== 0;
          if (was !== m.relay) { m.relayEvents.push([m.cpu.cycles, m.relay ? 1 : 0]); m.relayFrame.push([m.cpu.cycles - frameStart, m.relay ? 1 : 0]); }
        }
        return pia1.cra;
      }
      if (r === 2) { if (write) m.vdg = v; return m.vdg; }
      if (write) pia1.crb = v;
      return pia1.crb;
    }
    return 0xFF;
  }
  function rd(a) {
    if (a < 0x8000) return ram[a];
    if (a >= 0xFF00) return io(a, 0, false);
    return rom[a];
  }
  function wr(a, v) {
    if (a >= 0xFF00) { io(a, v, true); return; }
    if (a < 0x8000) ram[a] = v;
  }
  var cpu = m.cpu = new CPU6809(rd, wr, CYC);
  m.rd = rd; m.wr = wr;

  // ---- program image
  var b64 = function (s) { var bin = (typeof atob === 'function') ? atob(s) : Buffer.from(s, 'base64').toString('binary'); var o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };
  var code = b64(game.code), org = game.org;
  m.syms = game.syms;
  m.boot = function () {
    ram.fill(0);
    for (var i = 0; i < code.length; i++) ram[org + i] = code[i];
    for (i = 0x0400; i < 0x0600; i++) ram[i] = 0x60;                    // BASIC leaves a green screen
    m.vdg = 0; m.events = []; m.relayEvents = []; m.sigEvents = []; m.keyQueue = []; m.relay = false;
    pia0.cra = pia0.crb = pia1.cra = pia1.crb = 0; m.manualKey = false; sched = [];
    cpu.reset(m.syms.BEGIN); cpu.irq = false; cpu.cycles = 0; frameStart = 0;
  };

  m.runFrame = function () {
    frameStart = cpu.cycles; m.events = []; m.relayFrame = []; relayAtStart = m.relay;
    var target = cpu.cycles + CPF;
    // record the received-signal level at the start of the frame and every change inside it, for the sidetone
    var lvl = sigAt(frameStart), ev = m.sigEvents = [[0, lvl]];
    if (sched.length) for (var i = 0; i < sched.length; i++) { var t = sched[i][0]; if (t > frameStart && t < target) ev.push([t - frameStart, sched[i][1]]); }
    while (cpu.cycles < target) cpu.step();
    m.frameCycles = cpu.cycles - frameStart;
  };
  m.frameStartCycle = function () { return frameStart; };
  m.runSeconds = function (s) { var end = cpu.cycles + s * CPS; while (cpu.cycles < end) m.runFrame(); };

  // ---- audio: the DAC (sample-and-hold) plus the received-signal sidetone
  var lastDac = 32, phase = 0;
  m.sidetone = true; m.dacOn = true;
  m.tonePitch = 700;        // Hz, the sidetone
  m.txTone = 'dac';         // 'dac': the program's own square wave; 'sidetone': a clean tone keyed by the relay (what a monitor would give)
  m.audioFrame = function (rate) {
    var n = Math.round(rate / 60), out = new Float32Array(n), ev = m.events, e = 0, v = lastDac, se = m.sigEvents, k = 0, sl = se.length ? se[0][1] : 0;
    var re = m.relayFrame, r = 0, txOn = relayAtStart, txSide = m.txTone === 'sidetone';
    // The DAC only reaches the speaker while the sound-enable bit is set and the source mux selects the DAC.
    var dacOnNow = (pia1.crb & 8) !== 0 && (pia0.cra & 8) === 0 && (pia0.crb & 8) === 0;
    for (var s = 0; s < n; s++) {
      var t = s * CPF / n;
      while (e < ev.length && ev[e][0] <= t) { v = ev[e][1]; e++; }
      while (k < se.length && se[k][0] <= t) { sl = se[k][1]; k++; }
      while (r < re.length && re[r][0] <= t) { txOn = re[r][1]; r++; }
      var o = (m.dacOn && dacOnNow && !txSide) ? (v - 32) / 32 * 0.15 : 0;
      if (aud && m.sidetone) {
        var ai = Math.floor((frameStart - aud.start + t) / CPS * aud.rate);
        if (ai >= 0 && ai < aud.pcm.length) o += aud.pcm[ai] * 0.6;
      } else if (m.sidetone && (sl || (txSide && txOn))) { phase += m.tonePitch / rate; if (phase >= 1) phase -= 1; o += Math.sin(phase * 6.283185307) * 0.25; }
      out[s] = o;
    }
    while (e < ev.length) { v = ev[e][1]; e++; }
    lastDac = v; return out;
  };

  // ---- display: 32x16 alpha / semigraphics-4 text screen at $0400
  m.PALETTE = [[7, 255, 0], [255, 255, 0], [59, 8, 255], [204, 0, 59], [255, 255, 255], [7, 227, 153], [255, 28, 255], [255, 129, 0]];
  m.cssColor = function () { return (m.vdg >> 3) & 1 ? m.PALETTE[7] : m.PALETTE[0]; };
  m.screenText = function () {                    // plain text view for tests: '#' for a semigraphics cell
    var rows = [];
    for (var r = 0; r < 16; r++) {
      var s = '';
      for (var c = 0; c < 32; c++) {
        var b = ram[0x400 + r * 32 + c];
        if (b & 0x80) s += '#'; else { var g = b & 0x3F; s += String.fromCharCode(g < 32 ? g + 64 : g); }
      }
      rows.push(s);
    }
    return rows;
  };
  m.pressKey = function (code) { m.keyQueue.push(code); };
  m.typeText = function (str) { for (var i = 0; i < str.length; i++) m.keyQueue.push(str.charCodeAt(i)); };

  // ---- Morse helpers for the host side. The program's own TABLE (index = ASCII & 63) holds each code as 1 followed by
  // the elements, 1 = dah, 0 = dit; reading it from RAM means the receive-side test source and the program agree.
  m.morseFor = function (ch) {
    var idx = ch.charCodeAt(0) & 63, e = ram[m.syms.TABLE + idx];
    if (!e || ch === ' ') return null;
    var s = '';
    var bits = e.toString(2).slice(1);
    for (var i = 0; i < bits.length; i++) s += bits[i] === '1' ? '-' : '.';
    return s;
  };
  // Standard timing: dit = 1.2/wpm s; gap 1 dit between elements, 3 between letters, 7 between words.
  m.keyingFor = function (text, wpm, leadSeconds) {
    var dit = 1.2 / wpm * CPS, t = (leadSeconds || 0) * CPS, out = [[0, 0]];
    var words = text.toUpperCase().split(/\s+/).filter(Boolean);
    words.forEach(function (w, wi) {
      if (wi) t += 7 * dit;
      for (var ci = 0; ci < w.length; ci++) {
        var code = m.morseFor(w[ci]); if (!code) continue;
        if (ci) t += 3 * dit;
        for (var k = 0; k < code.length; k++) {
          if (k) t += dit;
          var len = code[k] === '-' ? 3 * dit : dit;
          out.push([Math.round(t), 1]); out.push([Math.round(t + len), 0]); t += len;
        }
      }
    });
    return out;
  };
}
// Two stations side by side: B's transmitter key line (its cassette relay) drives A's cassette input.
// Both machines are stepped one field at a time, B first, so a key edge inside a field lands at the same offset in A's field.
MorseCoCo.link = function (a, b) {
  var seen = 0;
  return {
    runFrame: function () {
      b.runFrame();
      var base = a.cpu.cycles, fs = b.frameStartCycle();
      for (; seen < b.relayEvents.length; seen++) { var e = b.relayEvents[seen]; a.addSignalEdge(base + Math.max(0, e[0] - fs), e[1]); }
      if (b.relayEvents.length > 256) { b.relayEvents.splice(0, seen); seen = 0; }
      a.runFrame();
    },
    runSeconds: function (s) { for (var i = 0, n = Math.round(s * 60); i < n; i++) this.runFrame(); }
  };
};
if (typeof module !== 'undefined') module.exports = MorseCoCo;
