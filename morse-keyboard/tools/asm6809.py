"""Small two-pass MC6809 assembler for the EDTASM-style listing (always extended, never direct)."""
import re, sys

REGS_IDX = {'X': 0, 'Y': 1, 'U': 2, 'S': 3}
TFR_CODES = {'D': 0, 'X': 1, 'Y': 2, 'U': 3, 'S': 4, 'PC': 5, 'A': 8, 'B': 9, 'CC': 10, 'DP': 11}
PUSH_BITS = {'CC': 0x01, 'A': 0x02, 'B': 0x04, 'DP': 0x08, 'X': 0x10, 'Y': 0x20, 'U': 0x40, 'S': 0x40, 'PC': 0x80}

INHERENT = {
    'NOP': [0x12], 'SYNC': [0x13], 'DAA': [0x19], 'SEX': [0x1D], 'RTS': [0x39], 'ABX': [0x3A],
    'RTI': [0x3B], 'MUL': [0x3D], 'SWI': [0x3F], 'SWI2': [0x10, 0x3F], 'SWI3': [0x11, 0x3F],
}
for n, o in [('NEG', 0x40), ('COM', 0x43), ('LSR', 0x44), ('ROR', 0x46), ('ASR', 0x47), ('LSL', 0x48),
             ('ASL', 0x48), ('ROL', 0x49), ('DEC', 0x4A), ('INC', 0x4C), ('TST', 0x4D), ('CLR', 0x4F)]:
    INHERENT[n + 'A'] = [o]
    INHERENT[n + 'B'] = [o + 0x10]

SHORT_BR = {'BRA': 0x20, 'BRN': 0x21, 'BHI': 0x22, 'BLS': 0x23, 'BCC': 0x24, 'BHS': 0x24, 'BCS': 0x25,
            'BLO': 0x25, 'BNE': 0x26, 'BEQ': 0x27, 'BVC': 0x28, 'BVS': 0x29, 'BPL': 0x2A, 'BMI': 0x2B,
            'BGE': 0x2C, 'BLT': 0x2D, 'BGT': 0x2E, 'BLE': 0x2F}

# name -> (prefix list, base opcode, immediate size: 0 none, 1, 2)
ACC = {}
for n, o, s in [('SUBA', 0x80, 1), ('CMPA', 0x81, 1), ('SBCA', 0x82, 1), ('ANDA', 0x84, 1), ('BITA', 0x85, 1),
                ('LDA', 0x86, 1), ('STA', 0x87, 0), ('EORA', 0x88, 1), ('ADCA', 0x89, 1), ('ORA', 0x8A, 1),
                ('ADDA', 0x8B, 1), ('SUBB', 0xC0, 1), ('CMPB', 0xC1, 1), ('SBCB', 0xC2, 1), ('ANDB', 0xC4, 1),
                ('BITB', 0xC5, 1), ('LDB', 0xC6, 1), ('STB', 0xC7, 0), ('EORB', 0xC8, 1), ('ADCB', 0xC9, 1),
                ('ORB', 0xCA, 1), ('ADDB', 0xCB, 1)]:
    ACC[n] = ([], o, s)
for n, o, s in [('SUBD', 0x83, 2), ('CMPX', 0x8C, 2), ('LDX', 0x8E, 2), ('STX', 0x8F, 0), ('ADDD', 0xC3, 2),
                ('LDD', 0xCC, 2), ('STD', 0xCD, 0), ('LDU', 0xCE, 2), ('STU', 0xCF, 0), ('JSR', 0x8D, 0)]:
    ACC[n] = ([], o, s)
for n, o, s in [('CMPD', 0x83, 2), ('CMPY', 0x8C, 2), ('LDY', 0x8E, 2), ('STY', 0x8F, 0), ('LDS', 0xCE, 2), ('STS', 0xCF, 0)]:
    ACC[n] = ([0x10], o, s)
for n, o, s in [('CMPU', 0x83, 2), ('CMPS', 0x8C, 2)]:
    ACC[n] = ([0x11], o, s)

MEMOPS = {'NEG': 0x0, 'COM': 0x3, 'LSR': 0x4, 'ROR': 0x6, 'ASR': 0x7, 'LSL': 0x8, 'ASL': 0x8, 'ROL': 0x9,
          'DEC': 0xA, 'INC': 0xC, 'TST': 0xD, 'JMP': 0xE, 'CLR': 0xF}
LEA = {'LEAX': 0x30, 'LEAY': 0x31, 'LEAS': 0x32, 'LEAU': 0x33}


class AsmError(Exception):
    pass


def eval_expr(expr, syms, strict=True):
    expr = expr.strip()
    if not expr:
        raise AsmError('empty expression')
    tokens = re.findall(r'[+-]?[^+-]+', expr)
    total = 0
    for t in tokens:
        sign = 1
        if t[0] in '+-':
            sign = -1 if t[0] == '-' else 1
            t = t[1:]
        if t.startswith('$'):
            v = int(t[1:], 16)
        elif re.fullmatch(r'\d+', t):
            v = int(t)
        elif t in syms:
            v = syms[t]
        elif not strict:
            v = 0
        else:
            raise AsmError('undefined symbol %r' % t)
        total += sign * v
    return total


def parse_index(op):
    """Return ('idx', postbyte, extra_bytes_spec) or None. extra = ('i8'|'i16', value expr) or None."""
    ind = False
    s = op
    if s.startswith('[') and s.endswith(']'):
        ind = True
        s = s[1:-1]
        if ',' not in s:
            return ('extind', s)
    if ',' not in s:
        return None
    off, reg = s.split(',', 1)
    reg = reg.strip().upper()
    off = off.strip()
    indbit = 0x10 if ind else 0
    m = re.fullmatch(r'(--|-)?([XYUS])(\+\+|\+)?', reg)
    if not m:
        raise AsmError('bad index register %r' % reg)
    pre, r, post = m.groups()
    rr = REGS_IDX[r] << 5
    if pre or post:
        if off:
            raise AsmError('offset with autoincrement')
        code = {('', '+'): 0x00, ('', '++'): 0x01, ('-', None): 0x02, ('--', None): 0x03}[(pre or '', post)]
        return ('idx', 0x80 | rr | indbit | code, None)
    if off.upper() in ('A', 'B', 'D'):
        code = {'A': 0x06, 'B': 0x05, 'D': 0x0B}[off.upper()]
        return ('idx', 0x80 | rr | indbit | code, None)
    if off == '':
        return ('idx', 0x80 | rr | indbit | 0x04, None)
    return ('idxoff', rr, indbit, off)


def idx_size(info, syms_known):
    """Bytes of the indexed postbyte + extension; offset expressions must be resolvable in pass 1."""
    if info[0] == 'idx':
        return 1
    if info[0] == 'extind':
        return 3
    _, rr, indbit, off = info
    if not re.fullmatch(r'[-+]?(\$[0-9A-Fa-f]+|\d+)', off.strip()):
        return 3          # symbolic offset: EDTASM always used the 16-bit form
    v = eval_expr(off, syms_known)
    if not indbit and -16 <= v <= 15:
        return 1
    if -128 <= v <= 127:
        return 2
    return 3


def idx_bytes(info, syms):
    if info[0] == 'idx':
        return [info[1]]
    if info[0] == 'extind':
        v = eval_expr(info[1], syms) & 0xFFFF
        return [0x9F, v >> 8, v & 0xFF]
    _, rr, indbit, off = info
    v = eval_expr(off, syms)
    if not re.fullmatch(r'[-+]?(\$[0-9A-Fa-f]+|\d+)', off.strip()):
        return [0x80 | rr | indbit | 0x09, (v >> 8) & 0xFF, v & 0xFF]
    if not indbit and -16 <= v <= 15:
        return [rr | (v & 0x1F)]
    if -128 <= v <= 127:
        return [0x80 | rr | indbit | 0x08, v & 0xFF]
    return [0x80 | rr | indbit | 0x09, (v >> 8) & 0xFF, v & 0xFF]


def fcc_bytes(operand):
    d = operand[0]
    end = operand.rindex(d)
    return [ord(c) for c in operand[1:end]]


def parse_line(raw):
    m = re.match(r'^(\d{5}) (.*)$', raw.rstrip('\n'))
    if not m:
        raise AsmError('bad line %r' % raw)
    num, rest = int(m.group(1)), m.group(2)
    label = ''
    if rest.startswith('*'):
        return num, '', '', ''
    if rest and not rest[0].isspace():
        parts = rest.split(None, 1)
        label = parts[0]
        rest = parts[1] if len(parts) > 1 else ''
    if rest.startswith('*'):
        return num, '', '', ''
    if rest.lstrip().startswith('*') and not label:
        return num, '', '', ''
    parts = rest.split(None, 1)
    mnem = parts[0].upper() if parts else ''
    if mnem == 'FCC':
        return num, label, 'FCC', parts[1].strip()
    parts = rest.split(None, 2)
    mnem = parts[0].upper() if parts else ''
    operand = parts[1] if len(parts) > 1 else ''
    return num, label, mnem, operand


def encode(mnem, operand, pc, syms, final):
    """Return list of bytes (pass 1 gives sizes only with final=False)."""
    st = syms
    out = []
    def val(e):
        return eval_expr(e, st, strict=final)
    if mnem in INHERENT:
        return list(INHERENT[mnem])
    if mnem in SHORT_BR:
        t = val(operand)
        rel = t - (pc + 2)
        if final and not -128 <= rel <= 127:
            raise AsmError('short branch out of range (%d): %s %s' % (rel, mnem, operand))
        return [SHORT_BR[mnem], rel & 0xFF]
    if mnem in ('LBRA', 'LBSR'):
        t = val(operand)
        rel = (t - (pc + 3)) & 0xFFFF
        return [0x16 if mnem == 'LBRA' else 0x17, rel >> 8, rel & 0xFF]
    if mnem == 'BSR':
        t = val(operand)
        rel = t - (pc + 2)
        if final and not -128 <= rel <= 127:
            raise AsmError('BSR out of range (%d): %s' % (rel, operand))
        return [0x8D, rel & 0xFF]
    if mnem.startswith('LB') and mnem[1:] in SHORT_BR:
        t = val(operand)
        rel = (t - (pc + 4)) & 0xFFFF
        return [0x10, SHORT_BR[mnem[1:]], rel >> 8, rel & 0xFF]
    if mnem in ('ORCC', 'ANDCC'):
        assert operand.startswith('#')
        return [0x1A if mnem == 'ORCC' else 0x1C, val(operand[1:]) & 0xFF]
    if mnem in ('TFR', 'EXG'):
        a, b = operand.upper().split(',')
        return [0x1F if mnem == 'TFR' else 0x1E, (TFR_CODES[a] << 4) | TFR_CODES[b]]
    if mnem in ('PSHS', 'PULS', 'PSHU', 'PULU'):
        mask = 0
        for r in operand.upper().split(','):
            mask |= PUSH_BITS[r]
        return [{'PSHS': 0x34, 'PULS': 0x35, 'PSHU': 0x36, 'PULU': 0x37}[mnem], mask]
    if mnem in LEA:
        info = parse_index(operand)
        if info is None or info[0] == 'extind':
            raise AsmError('LEA needs indexed operand')
        syms_known = syms if final else syms
        if final:
            return [LEA[mnem]] + idx_bytes(info, st)
        return [LEA[mnem]] + [0] * idx_size(info, st)
    if mnem in ACC:
        prefix, base, imm = ACC[mnem]
        if operand.startswith('#'):
            if imm == 0:
                raise AsmError('no immediate for ' + mnem)
            v = val(operand[1:])
            if imm == 1:
                return prefix + [base, v & 0xFF]
            return prefix + [base, (v >> 8) & 0xFF, v & 0xFF]
        info = parse_index(operand)
        if info is not None:
            opc = base + 0x20
            if final:
                return prefix + [opc] + idx_bytes(info, st)
            return prefix + [opc] + [0] * idx_size(info, st)
        v = val(operand) & 0xFFFF
        return prefix + [base + 0x30, v >> 8, v & 0xFF]
    if mnem in MEMOPS:
        n = MEMOPS[mnem]
        info = parse_index(operand)
        if info is not None:
            if final:
                return [0x60 + n] + idx_bytes(info, st)
            return [0x60 + n] + [0] * idx_size(info, st)
        v = val(operand) & 0xFFFF
        return [0x70 + n, v >> 8, v & 0xFF]
    raise AsmError('unknown mnemonic %r' % mnem)


def assemble(lines, org):
    parsed = [parse_line(l) for l in lines if l.strip()]
    # Pass 1: addresses
    syms = {}
    pc = org
    layout = []
    for num, label, mnem, operand in parsed:
        if label:
            if label in syms:
                raise AsmError('duplicate label %s' % label)
            syms[label] = pc
        if mnem == 'EQU':
            syms[label] = eval_expr(operand, syms); layout.append((num, pc, '', operand, 0)); continue
        if mnem == 'FCC':
            n = len(fcc_bytes(operand))
            layout.append((num, pc, mnem, operand, n)); pc += n; continue
        if mnem == 'END':
            layout.append((num, pc, mnem, operand, 0))
            break
        if mnem == 'RMB':
            n = eval_expr(operand, syms)
            layout.append((num, pc, mnem, operand, n)); pc += n; continue
        if mnem == 'FCB':
            n = 1
        elif mnem == 'FDB':
            n = 2
        elif mnem == 'ORG':
            pc = eval_expr(operand, syms); layout.append((num, pc, mnem, operand, 0)); continue
        elif mnem == '':
            layout.append((num, pc, mnem, operand, 0)); continue
        else:
            try:
                n = len(encode(mnem, operand, pc, syms, False))
            except AsmError as e:
                raise AsmError('line %05d: %s' % (num, e))
        layout.append((num, pc, mnem, operand, n))
        pc += n
    end_pc = pc
    # Pass 2
    mem = {}
    listing = []
    for num, addr, mnem, operand, n in layout:
        try:
            if mnem == 'END' or mnem == '' or mnem == 'ORG':
                continue
            if mnem == 'RMB':
                bs = [0] * n
            elif mnem == 'FCC':
                bs = fcc_bytes(operand)
            elif mnem == 'FCB':
                bs = [eval_expr(operand, syms) & 0xFF]
            elif mnem == 'FDB':
                v = eval_expr(operand, syms) & 0xFFFF
                bs = [v >> 8, v & 0xFF]
            else:
                bs = encode(mnem, operand, addr, syms, True)
                if len(bs) != n:
                    raise AsmError('size changed between passes')
        except AsmError as e:
            raise AsmError('line %05d: %s' % (num, e))
        for i, b in enumerate(bs):
            mem[addr + i] = b
        listing.append((num, addr, bs, mnem, operand))
    return mem, syms, listing, end_pc


if __name__ == '__main__':
    src = open(sys.argv[1]).read().splitlines()
    org = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x2000
    mem, syms, listing, end_pc = assemble(src, org)
    print('assembled %d bytes, %04X-%04X' % (len(mem), min(mem), end_pc - 1))
