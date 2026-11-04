// MC6809 CPU core. Memory/IO supplied by the owner via rd(addr) / wr(addr,val).
function CPU6809(rd, wr, CYC) {
  var c = this;
  c.a = 0; c.b = 0; c.x = 0; c.y = 0; c.u = 0; c.s = 0; c.pc = 0; c.dp = 0; c.cc = 0x50;
  c.cycles = 0; c.irq = false; c.halted = false; c.waiting = false;
  var E = 0x80, F = 0x40, H = 0x20, I = 0x10, N = 8, Z = 4, V = 2, C = 1;

  function rd16(a) { return (rd(a & 0xFFFF) << 8) | rd((a + 1) & 0xFFFF); }
  function wr16(a, v) { wr(a & 0xFFFF, (v >> 8) & 255); wr((a + 1) & 0xFFFF, v & 255); }
  function fetch() { var v = rd(c.pc); c.pc = (c.pc + 1) & 0xFFFF; return v; }
  function fetch16() { var v = (rd(c.pc) << 8) | rd((c.pc + 1) & 0xFFFF); c.pc = (c.pc + 2) & 0xFFFF; return v; }
  function sx8(v) { return v & 0x80 ? v - 256 : v; }
  function sx16(v) { return v & 0x8000 ? v - 65536 : v; }
  function setNZ8(v) { c.cc = (c.cc & ~(N | Z)) | (v & 0x80 ? N : 0) | ((v & 255) === 0 ? Z : 0); }
  function setNZ16(v) { c.cc = (c.cc & ~(N | Z)) | (v & 0x8000 ? N : 0) | ((v & 0xFFFF) === 0 ? Z : 0); }
  function D() { return (c.a << 8) | c.b; }
  function setD(v) { c.a = (v >> 8) & 255; c.b = v & 255; }

  // ---- ALU
  function add8(p, q, cin) {
    var r = p + q + cin, f = c.cc & ~(H | N | Z | V | C);
    if (((p & 15) + (q & 15) + cin) > 15) f |= H;
    if (r > 255) f |= C;
    if (~(p ^ q) & (p ^ r) & 0x80) f |= V;
    r &= 255; if (r & 0x80) f |= N; if (!r) f |= Z; c.cc = f; return r;
  }
  function sub8(p, q, cin) {
    var r = p - q - cin, f = c.cc & ~(N | Z | V | C);
    if (r < 0) f |= C;
    if ((p ^ q) & (p ^ r) & 0x80) f |= V;
    r &= 255; if (r & 0x80) f |= N; if (!r) f |= Z; c.cc = f; return r;
  }
  function add16(p, q) {
    var r = p + q, f = c.cc & ~(N | Z | V | C);
    if (r > 0xFFFF) f |= C;
    if (~(p ^ q) & (p ^ r) & 0x8000) f |= V;
    r &= 0xFFFF; if (r & 0x8000) f |= N; if (!r) f |= Z; c.cc = f; return r;
  }
  function sub16(p, q) {
    var r = p - q, f = c.cc & ~(N | Z | V | C);
    if (r < 0) f |= C;
    if ((p ^ q) & (p ^ r) & 0x8000) f |= V;
    r &= 0xFFFF; if (r & 0x8000) f |= N; if (!r) f |= Z; c.cc = f; return r;
  }
  function and8(p, q) { var r = p & q; setNZ8(r); c.cc &= ~V; return r; }
  function or8(p, q) { var r = p | q; setNZ8(r); c.cc &= ~V; return r; }
  function eor8(p, q) { var r = p ^ q; setNZ8(r); c.cc &= ~V; return r; }
  function ld8(v) { setNZ8(v); c.cc &= ~V; return v; }
  function ld16(v) { setNZ16(v); c.cc &= ~V; return v; }
  // read-modify-write unary ops (value in, value out)
  function neg(v) { return sub8(0, v, 0); }
  function com(v) { var r = (~v) & 255; setNZ8(r); c.cc = (c.cc & ~V) | C; return r; }
  function lsr(v) { var r = v >> 1; c.cc = (c.cc & ~(N | Z | C)) | (v & 1 ? C : 0) | (r ? 0 : Z); return r; }
  function ror(v) { var r = (v >> 1) | (c.cc & C ? 0x80 : 0); c.cc = (c.cc & ~(N | Z | C)) | (v & 1 ? C : 0) | (r & 0x80 ? N : 0) | (r ? 0 : Z); return r; }
  function asr(v) { var r = (v >> 1) | (v & 0x80); c.cc = (c.cc & ~(N | Z | C)) | (v & 1 ? C : 0) | (r & 0x80 ? N : 0) | (r ? 0 : Z); return r; }
  function asl(v) {
    var r = (v << 1) & 255, cy = v & 0x80 ? 1 : 0, n = r & 0x80 ? 1 : 0;
    c.cc = (c.cc & ~(N | Z | V | C)) | (cy ? C : 0) | (n ? N : 0) | (r ? 0 : Z) | ((n ^ cy) ? V : 0); return r;
  }
  function rol(v) {
    var r = ((v << 1) | (c.cc & C ? 1 : 0)) & 255, cy = v & 0x80 ? 1 : 0, n = r & 0x80 ? 1 : 0;
    c.cc = (c.cc & ~(N | Z | V | C)) | (cy ? C : 0) | (n ? N : 0) | (r ? 0 : Z) | ((n ^ cy) ? V : 0); return r;
  }
  function dec(v) { var r = (v - 1) & 255; c.cc = (c.cc & ~(N | Z | V)) | (r & 0x80 ? N : 0) | (r ? 0 : Z) | (r === 0x7F ? V : 0); return r; }
  function inc(v) { var r = (v + 1) & 255; c.cc = (c.cc & ~(N | Z | V)) | (r & 0x80 ? N : 0) | (r ? 0 : Z) | (r === 0x80 ? V : 0); return r; }
  function tst(v) { setNZ8(v); c.cc &= ~V; return v; }
  function clr() { c.cc = (c.cc & ~(N | V | C)) | Z; return 0; }

  var extra = 0; // extra cycles from indexed postbyte
  function idxReg(sel) { return sel === 0 ? c.x : sel === 1 ? c.y : sel === 2 ? c.u : c.s; }
  function setIdxReg(sel, v) { v &= 0xFFFF; if (sel === 0) c.x = v; else if (sel === 1) c.y = v; else if (sel === 2) c.u = v; else c.s = v; }
  function indexed() {
    var p = fetch(), sel = (p >> 5) & 3, ea, ind = false;
    if (!(p & 0x80)) {
      var off = p & 0x1F; if (off & 0x10) off -= 32;
      extra = 1; return (idxReg(sel) + off) & 0xFFFF;
    }
    ind = !!(p & 0x10);
    switch (p & 0x0F) {
      case 0: ea = idxReg(sel); setIdxReg(sel, ea + 1); extra = 2; break;
      case 1: ea = idxReg(sel); setIdxReg(sel, ea + 2); extra = 3; break;
      case 2: setIdxReg(sel, idxReg(sel) - 1); ea = idxReg(sel); extra = 2; break;
      case 3: setIdxReg(sel, idxReg(sel) - 2); ea = idxReg(sel); extra = 3; break;
      case 4: ea = idxReg(sel); extra = 0; break;
      case 5: ea = idxReg(sel) + sx8(c.b); extra = 1; break;
      case 6: ea = idxReg(sel) + sx8(c.a); extra = 1; break;
      case 8: ea = idxReg(sel) + sx8(fetch()); extra = 1; break;
      case 9: ea = idxReg(sel) + fetch16(); extra = 4; break;
      case 11: ea = idxReg(sel) + D(); extra = 4; break;
      case 12: { var o = sx8(fetch()); ea = c.pc + o; extra = 1; break; }
      case 13: { var o16 = fetch16(); ea = c.pc + o16; extra = 5; break; }
      case 15: ea = fetch16(); extra = 5; ind = true; break;
      default: ea = 0; extra = 0; break; // illegal
    }
    ea &= 0xFFFF;
    if (ind) { ea = rd16(ea); extra += 3; if ((p & 0x0F) === 15) extra -= 3; }
    return ea;
  }

  function branchCond(k) {
    var cc = c.cc;
    switch (k) {
      case 0: return true; case 1: return false;
      case 2: return !(cc & (C | Z)); case 3: return !!(cc & (C | Z));
      case 4: return !(cc & C); case 5: return !!(cc & C);
      case 6: return !(cc & Z); case 7: return !!(cc & Z);
      case 8: return !(cc & V); case 9: return !!(cc & V);
      case 10: return !(cc & N); case 11: return !!(cc & N);
      case 12: return !!(cc & N) === !!(cc & V);
      case 13: return !!(cc & N) !== !!(cc & V);
      case 14: return !(cc & Z) && (!!(cc & N) === !!(cc & V));
      default: return !!(cc & Z) || (!!(cc & N) !== !!(cc & V));
    }
  }

  // stack helpers
  function pushS8(v) { c.s = (c.s - 1) & 0xFFFF; wr(c.s, v & 255); }
  function pushS16(v) { pushS8(v); pushS8(v >> 8); }
  function pullS8() { var v = rd(c.s); c.s = (c.s + 1) & 0xFFFF; return v; }
  function pullS16() { var h = pullS8(); return (h << 8) | pullS8(); }
  function pushU8(v) { c.u = (c.u - 1) & 0xFFFF; wr(c.u, v & 255); }
  function pushU16(v) { pushU8(v); pushU8(v >> 8); }
  function pullU8() { var v = rd(c.u); c.u = (c.u + 1) & 0xFFFF; return v; }
  function pullU16() { var h = pullU8(); return (h << 8) | pullU8(); }

  function pshs(m) {
    var n = 0;
    if (m & 0x80) { pushS16(c.pc); n += 2; } if (m & 0x40) { pushS16(c.u); n += 2; }
    if (m & 0x20) { pushS16(c.y); n += 2; } if (m & 0x10) { pushS16(c.x); n += 2; }
    if (m & 0x08) { pushS8(c.dp); n++; } if (m & 0x04) { pushS8(c.b); n++; }
    if (m & 0x02) { pushS8(c.a); n++; } if (m & 0x01) { pushS8(c.cc); n++; }
    return n;
  }
  function puls(m) {
    var n = 0;
    if (m & 0x01) { c.cc = pullS8(); n++; } if (m & 0x02) { c.a = pullS8(); n++; }
    if (m & 0x04) { c.b = pullS8(); n++; } if (m & 0x08) { c.dp = pullS8(); n++; }
    if (m & 0x10) { c.x = pullS16(); n += 2; } if (m & 0x20) { c.y = pullS16(); n += 2; }
    if (m & 0x40) { c.u = pullS16(); n += 2; } if (m & 0x80) { c.pc = pullS16(); n += 2; }
    return n;
  }
  function pshu(m) {
    var n = 0;
    if (m & 0x80) { pushU16(c.pc); n += 2; } if (m & 0x40) { pushU16(c.s); n += 2; }
    if (m & 0x20) { pushU16(c.y); n += 2; } if (m & 0x10) { pushU16(c.x); n += 2; }
    if (m & 0x08) { pushU8(c.dp); n++; } if (m & 0x04) { pushU8(c.b); n++; }
    if (m & 0x02) { pushU8(c.a); n++; } if (m & 0x01) { pushU8(c.cc); n++; }
    return n;
  }
  function pulu(m) {
    var n = 0;
    if (m & 0x01) { c.cc = pullU8(); n++; } if (m & 0x02) { c.a = pullU8(); n++; }
    if (m & 0x04) { c.b = pullU8(); n++; } if (m & 0x08) { c.dp = pullU8(); n++; }
    if (m & 0x10) { c.x = pullU16(); n += 2; } if (m & 0x20) { c.y = pullU16(); n += 2; }
    if (m & 0x40) { c.s = pullU16(); n += 2; } if (m & 0x80) { c.pc = pullU16(); n += 2; }
    return n;
  }

  function getReg(n) {
    switch (n) {
      case 0: return D(); case 1: return c.x; case 2: return c.y; case 3: return c.u; case 4: return c.s; case 5: return c.pc;
      case 8: return c.a; case 9: return c.b; case 10: return c.cc; case 11: return c.dp; default: return 0xFF;
    }
  }
  function setReg(n, v) {
    switch (n) {
      case 0: setD(v); break; case 1: c.x = v & 0xFFFF; break; case 2: c.y = v & 0xFFFF; break; case 3: c.u = v & 0xFFFF; break;
      case 4: c.s = v & 0xFFFF; break; case 5: c.pc = v & 0xFFFF; break;
      case 8: c.a = v & 255; break; case 9: c.b = v & 255; break; case 10: c.cc = v & 255; break; case 11: c.dp = v & 255; break;
    }
  }
  function tfrExg(post, exg) {
    var s = post >> 4, d = post & 15;
    var sv = getReg(s), dv = getReg(d);
    var s16 = s < 8, d16 = d < 8;
    // mixed sizes: 8-bit sources are extended with $FF (hardware behaviour); keep simple
    if (s16 && !d16) sv &= 255; else if (!s16 && d16) sv = 0xFF00 | sv;
    if (exg) {
      if (d16 && !s16) dv = 0xFF00 | dv; else if (!d16 && s16) dv &= 255;
      setReg(d, sv); setReg(s, dv);
    } else setReg(d, sv);
  }

  function interrupt(vec, full, mask) {
    if (full) { c.cc |= E; pshs(0xFF); } else { c.cc &= ~E; pshs(0x81); }
    c.cc |= mask; c.pc = rd16(vec);
  }

  function daa() {
    var a = c.a, cf = 0, lo = a & 15, hi = a >> 4;
    if ((c.cc & H) || lo > 9) cf |= 0x06;
    if ((c.cc & C) || hi > 9 || (hi > 8 && lo > 9)) cf |= 0x60;
    var r = a + cf; var cy = (c.cc & C) || r > 255;
    c.a = r & 255; setNZ8(c.a); c.cc = (c.cc & ~(C | V)) | (cy ? C : 0);
  }

  c.step = function () {
    if (c.irq && !(c.cc & I)) {
      c.waiting = false; interrupt(0xFFF8, true, I | F); c.cycles += 19; return 19;
    }
    if (c.waiting) { c.cycles += 1; return 1; }
    var op = fetch(), page = 0, ea = 0, m = 0, t = 0;
    extra = 0;
    if (op === 0x10) { page = 256; op = fetch(); } else if (op === 0x11) { page = 512; op = fetch(); }
    var cyc = CYC[page + op] || 2;

    if (page === 0) {
      var hi = op >> 4, lo = op & 15;
      // ---- 0x00-0x0F direct RMW, 0x60-0x6F indexed RMW, 0x70-0x7F extended RMW
      if (hi === 0 || hi === 6 || hi === 7) {
        if (lo === 0x0E || lo === 0x0F) {
          if (lo === 0x0E) { // JMP
            ea = hi === 0 ? ((c.dp << 8) | fetch()) : hi === 6 ? indexed() : fetch16();
            c.pc = ea;
          } else { // CLR
            ea = hi === 0 ? ((c.dp << 8) | fetch()) : hi === 6 ? indexed() : fetch16();
            rd(ea); wr(ea, clr());
          }
          c.cycles += cyc + extra; return cyc + extra;
        }
        if (lo === 0x0B || lo === 0x02 || lo === 0x05 || lo === 0x0D && false) { /* illegal */ c.cycles += cyc; return cyc; }
        ea = hi === 0 ? ((c.dp << 8) | fetch()) : hi === 6 ? indexed() : fetch16();
        m = rd(ea);
        switch (lo) {
          case 0: m = neg(m); break; case 3: m = com(m); break; case 4: m = lsr(m); break;
          case 6: m = ror(m); break; case 7: m = asr(m); break; case 8: m = asl(m); break;
          case 9: m = rol(m); break; case 10: m = dec(m); break; case 12: m = inc(m); break;
          case 13: tst(m); c.cycles += cyc + extra; return cyc + extra;
          default: c.cycles += cyc; return cyc;
        }
        wr(ea, m); c.cycles += cyc + extra; return cyc + extra;
      }
      switch (hi) {
        case 1:
          switch (lo) {
            case 2: break; // NOP
            case 3: c.waiting = true; break; // SYNC (simplified)
            case 6: t = fetch16(); c.pc = (c.pc + t) & 0xFFFF; break; // LBRA
            case 7: t = fetch16(); pushS16(c.pc); c.pc = (c.pc + t) & 0xFFFF; break; // LBSR
            case 9: daa(); break;
            case 10: c.cc |= fetch(); break; // ORCC
            case 12: c.cc &= fetch(); break; // ANDCC
            case 13: c.a = (c.b & 0x80) ? 255 : 0; setNZ8(c.b); break; // SEX -> D
            case 14: tfrExg(fetch(), true); break;
            case 15: tfrExg(fetch(), false); break;
            default: break;
          }
          break;
        case 2: // short branches
          t = sx8(fetch()); if (branchCond(lo)) c.pc = (c.pc + t) & 0xFFFF; break;
        case 3:
          switch (lo) {
            case 0: c.x = indexed(); c.cc = (c.cc & ~Z) | (c.x ? 0 : Z); break;
            case 1: c.y = indexed(); c.cc = (c.cc & ~Z) | (c.y ? 0 : Z); break;
            case 2: c.s = indexed(); break;
            case 3: c.u = indexed(); break;
            case 4: t = fetch(); cyc += pshs(t); break;
            case 5: t = fetch(); cyc += puls(t); break;
            case 6: t = fetch(); cyc += pshu(t); break;
            case 7: t = fetch(); cyc += pulu(t); break;
            case 9: c.pc = pullS16(); break; // RTS
            case 10: c.x = (c.x + c.b) & 0xFFFF; break; // ABX
            case 11: // RTI
              c.cc = pullS8();
              if (c.cc & E) { c.a = pullS8(); c.b = pullS8(); c.dp = pullS8(); c.x = pullS16(); c.y = pullS16(); c.u = pullS16(); cyc += 9; }
              c.pc = pullS16(); break;
            case 12: c.cc &= fetch(); c.cc |= E; c.waiting = true; break; // CWAI (simplified)
            case 13: // MUL
              t = c.a * c.b; setD(t);
              c.cc = (c.cc & ~(Z | C)) | (t ? 0 : Z) | (t & 0x80 ? C : 0); break;
            case 15: interrupt(0xFFFA, true, I | F); break; // SWI
            default: break;
          }
          break;
        case 4: case 5: { // inherent A / B
          var rv = hi === 4 ? c.a : c.b, r2 = rv;
          switch (lo) {
            case 0: r2 = neg(rv); break; case 3: r2 = com(rv); break; case 4: r2 = lsr(rv); break;
            case 6: r2 = ror(rv); break; case 7: r2 = asr(rv); break; case 8: r2 = asl(rv); break;
            case 9: r2 = rol(rv); break; case 10: r2 = dec(rv); break; case 12: r2 = inc(rv); break;
            case 13: tst(rv); break; case 15: r2 = clr(); break;
            default: break;
          }
          if (hi === 4) c.a = r2; else c.b = r2;
          break;
        }
        case 8: case 9: case 10: case 11: case 12: case 13: case 14: case 15: {
          var isB = hi >= 12, mode = hi & 3; // 0 imm,1 direct,2 indexed,3 extended
          var is16 = false;
          // 16-bit ops: lo 3 (SUBD/ADDD), 12 (CMPX/LDD), 14 (LDX/LDU), 8D (BSR/JSR) etc.
          if (!isB) { is16 = (lo === 3 || lo === 12 || lo === 14); } else { is16 = (lo === 3 || lo === 12 || lo === 13 || lo === 14 || lo === 15); }
          if (hi === 8 && lo === 13) { // BSR
            t = sx8(fetch()); pushS16(c.pc); c.pc = (c.pc + t) & 0xFFFF; c.cycles += cyc; return cyc;
          }
          // operand fetch
          if (mode === 0) { if (is16 || (hi === 8 && lo === 0x0F)) { ea = -1; } else ea = -1; }
          if (mode === 1) ea = (c.dp << 8) | fetch();
          else if (mode === 2) ea = indexed();
          else if (mode === 3) ea = fetch16();
          if (mode === 0) { m = is16 ? fetch16() : fetch(); }
          else if (!(lo === 7 || lo === 0x0F && !isB && false) ) { /* handled below by op */ }
          var rd8 = function () { return mode === 0 ? m : rd(ea); };
          var rd16v = function () { return mode === 0 ? m : rd16(ea); };
          if (!isB) { // 0x80-0xBF : A ops, CMPX, JSR, LDX, STX
            switch (lo) {
              case 0: c.a = sub8(c.a, rd8(), 0); break;
              case 1: sub8(c.a, rd8(), 0); break;
              case 2: c.a = sub8(c.a, rd8(), c.cc & C ? 1 : 0); break;
              case 3: setD(sub16(D(), rd16v())); break;
              case 4: c.a = and8(c.a, rd8()); break;
              case 5: and8(c.a, rd8()); break;
              case 6: c.a = ld8(rd8()); break;
              case 7: t = c.a; wr(ea, t); setNZ8(t); c.cc &= ~V; break; // STA
              case 8: c.a = eor8(c.a, rd8()); break;
              case 9: c.a = add8(c.a, rd8(), c.cc & C ? 1 : 0); break;
              case 10: c.a = or8(c.a, rd8()); break;
              case 11: c.a = add8(c.a, rd8(), 0); break;
              case 12: sub16(c.x, rd16v()); break; // CMPX
              case 13: pushS16(c.pc); c.pc = ea; break; // JSR (not immediate)
              case 14: c.x = ld16(rd16v()); break;
              case 15: wr16(ea, c.x); setNZ16(c.x); c.cc &= ~V; break; // STX
            }
          } else {
            switch (lo) {
              case 0: c.b = sub8(c.b, rd8(), 0); break;
              case 1: sub8(c.b, rd8(), 0); break;
              case 2: c.b = sub8(c.b, rd8(), c.cc & C ? 1 : 0); break;
              case 3: setD(add16(D(), rd16v())); break;
              case 4: c.b = and8(c.b, rd8()); break;
              case 5: and8(c.b, rd8()); break;
              case 6: c.b = ld8(rd8()); break;
              case 7: wr(ea, c.b); setNZ8(c.b); c.cc &= ~V; break;
              case 8: c.b = eor8(c.b, rd8()); break;
              case 9: c.b = add8(c.b, rd8(), c.cc & C ? 1 : 0); break;
              case 10: c.b = or8(c.b, rd8()); break;
              case 11: c.b = add8(c.b, rd8(), 0); break;
              case 12: setD(ld16(rd16v())); break; // LDD
              case 13: wr16(ea, D()); setNZ16(D()); c.cc &= ~V; break; // STD
              case 14: c.u = ld16(rd16v()); break; // LDU
              case 15: wr16(ea, c.u); setNZ16(c.u); c.cc &= ~V; break; // STU
            }
          }
          // fix: 0x8E etc. immediate LDX fetch handled; 0x87 (STA imm) / 0xC7 illegal ignored
          break;
        }
      }
      c.cycles += cyc + extra; return cyc + extra;
    }

    // ---- page 2 ($10xx) and page 3 ($11xx)
    if (op >= 0x21 && op <= 0x2F && page === 256) { // long branches
      t = fetch16(); if (branchCond(op & 15)) { c.pc = (c.pc + t) & 0xFFFF; cyc += 1; }
      c.cycles += cyc; return cyc;
    }
    if (op === 0x3F) { interrupt(page === 256 ? 0xFFF4 : 0xFFF2, true, I | F); c.cycles += cyc; return cyc; }
    var hi2 = op >> 4, lo2 = op & 15, md = hi2 & 3;
    if (hi2 >= 8) {
      var imm = (hi2 === 8 || hi2 === 12);
      if (hi2 === 8 || hi2 === 12) { mode = 0; } 
      mode = hi2 & 3; // 8:imm 9:direct A:indexed B:ext ; C..F same
      if (mode === 1) ea = (c.dp << 8) | fetch(); else if (mode === 2) ea = indexed(); else if (mode === 3) ea = fetch16();
      var val16 = function () { return mode === 0 ? fetch16() : rd16(ea); };
      if (page === 256) {
        switch (op) {
          case 0x83: sub16(D(), val16()); break;                 // CMPD
          case 0x8C: case 0x9C: case 0xAC: case 0xBC: break;       // (page 3 only)
          case 0x8E: case 0x9E: case 0xAE: case 0xBE: c.y = ld16(val16()); break;
          case 0x9F: case 0xAF: case 0xBF: wr16(ea, c.y); setNZ16(c.y); c.cc &= ~V; break;
          case 0xCE: case 0xDE: case 0xEE: case 0xFE: c.s = ld16(val16()); break;
          case 0xDF: case 0xEF: case 0xFF: wr16(ea, c.s); setNZ16(c.s); c.cc &= ~V; break;
          case 0x93: case 0xA3: case 0xB3: sub16(D(), val16()); break;
          default: break;
        }
        if (op === 0x8C || op === 0x9C || op === 0xAC || op === 0xBC) sub16(c.y, val16());
      } else {
        switch (op) {
          case 0x83: case 0x93: case 0xA3: case 0xB3: sub16(c.u, val16()); break; // CMPU
          case 0x8C: case 0x9C: case 0xAC: case 0xBC: sub16(c.s, val16()); break; // CMPS
          default: break;
        }
      }
    }
    c.cycles += cyc + extra; return cyc + extra;
  };

  c.run = function (target) { while (c.cycles < target) c.step(); };
  c.reset = function (pc) { c.a = c.b = 0; c.x = c.y = c.u = c.s = 0; c.dp = 0; c.cc = 0x50; c.pc = pc; c.irq = false; c.waiting = false; };
}
if (typeof module !== 'undefined') module.exports = CPU6809;
