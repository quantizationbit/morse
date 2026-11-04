// Audio-to-key-line shim: turns a recording (decoded mp3 / aac / wav samples) into the on/off line the program times.
// Like a hardware tone decoder: find the loudest steady tone, detect it synchronously (mix with sin/cos, low-pass), and run
// the result through a Schmitt trigger. Everything outside the tone's narrow band, including most noise, drops out.
var MorseAudioIn = (function () {
  function goertzel(x, from, n, rate, f) {
    var w = 2 * Math.PI * f / rate, c = 2 * Math.cos(w), s1 = 0, s2 = 0;
    for (var i = from; i < from + n; i++) { var s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
    return s1 * s1 + s2 * s2 - c * s1 * s2;
  }
  function findTone(pcm, rate, minHz) {
    var N = 4096, best = 0, bestAt = 0, i;
    for (var at = 0; at + N <= pcm.length; at += N >> 1) {               // loudest block = a block with tone in it
      var e = 0; for (i = at; i < at + N; i++) e += pcm[i] * pcm[i];
      if (e > best) { best = e; bestAt = at; }
    }
    var bf = 700, bp = -1;
    for (var f = minHz || 300; f <= 2400; f += 5) { var p = goertzel(pcm, bestAt, N, rate, f); if (p > bp) { bp = p; bf = f; } }
    return bf;
  }
  // Returns {freq, key}: key[i] = 1 while the tone is present.
  function detect(pcm, rate, opts) {
    opts = opts || {};
    var f = opts.freq || findTone(pcm, rate), n = pcm.length, env = new Float32Array(n);
    var w = 2 * Math.PI * f / rate, a = 1 - Math.exp(-1 / (0.004 * rate)), I = 0, Q = 0, i;   // 4 ms smoothing
    for (i = 0; i < n; i++) {
      I += (pcm[i] * Math.cos(w * i) - I) * a; Q += (pcm[i] * Math.sin(w * i) - Q) * a;
      env[i] = Math.sqrt(I * I + Q * Q);
    }
    var sorted = Float32Array.from(env).sort(), peak = sorted[Math.floor(n * 0.98)];
    var on = peak * (opts.on || 0.5), off = peak * (opts.off || 0.3), key = new Uint8Array(n), st = 0;
    for (i = 0; i < n; i++) { if (!st && env[i] > on) st = 1; else if (st && env[i] < off) st = 0; key[i] = st; }
    return {freq: f, key: key};
  }
  return {detect: detect, findTone: findTone};
})();
if (typeof module !== 'undefined') module.exports = MorseAudioIn;
