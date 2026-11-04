// Frequency shift (heterodyne / single sideband) for test recordings: moves a keyed tone by df Hz without touching its timing.
// ffmpeg's asetrate+atempo pitch trick time-stretches in ~16 ms overlap windows, which chops a pure tone into blips.
function fft(re, im, inv) {
  var n = re.length, i, j = 0, k, m;
  for (i = 1; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (var len = 2; len <= n; len <<= 1) {
    var ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
    for (i = 0; i < n; i += len) {
      var cr = 1, ci = 0;
      for (k = 0; k < len / 2; k++) {
        m = i + k + len / 2;
        var ur = re[i + k], ui = im[i + k], vr = re[m] * cr - im[m] * ci, vi = re[m] * ci + im[m] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[m] = ur - vr; im[m] = ui - vi;
        var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inv) for (i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function frequencyShift(x, rate, df) {
  var n = 1; while (n < x.length) n <<= 1;
  var re = new Float64Array(n), im = new Float64Array(n), i;
  re.set(x); fft(re, im, false);
  for (i = 1; i < n / 2; i++) { re[i] *= 2; im[i] *= 2; }              // analytic signal: keep positive frequencies, doubled
  for (i = n / 2 + 1; i < n; i++) { re[i] = 0; im[i] = 0; }
  fft(re, im, true);
  var out = new Float32Array(x.length), w = 2 * Math.PI * df / rate;
  for (i = 0; i < x.length; i++) out[i] = re[i] * Math.cos(w * i) - im[i] * Math.sin(w * i);
  return out;
}
if (typeof module !== 'undefined') module.exports = {frequencyShift: frequencyShift};
