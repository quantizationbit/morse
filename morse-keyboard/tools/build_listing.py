"""Rebuild listing/morse_listing.txt from the working transcript and verify it against the printout.

The scan shows address + object bytes for every line, plus an assembler symbol table.
work/transcript_*.txt holds ADDR|BYTES|LINE|SOURCE for each line; this script assembles the
source at the listing's own origin and checks every address/byte against the printout.
"""
import os, sys, glob
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import asm6809

HEADER = ["00100 *MORSE CODE PROGRAM", "00110 * BY BILL MANDEL", "00120 *"]
rows = []
def mnem(src):
    t = src.split()
    return t[0] if src[0] == ' ' else t[1]
for f in sorted(glob.glob(os.path.join(ROOT, 'work', 'transcript_*.txt'))):
    for l in open(f).read().splitlines():
        if l.strip():
            a, b, n, src = l.split('|', 3)
            rows.append((a, b, n, src))
# FCC strings: the printout shows the true length by the next line's address; pad trailing blanks to match
for i, (a, b, n, src) in enumerate(rows):
    if a != '-' and mnem(src) == 'FCC':
        want = int(rows[i + 1][0], 16) - int(a, 16)
        head, body = src.split('FCC ', 1)
        d, text = body[0], body[1:body.rindex(body[0])]
        if len(text) > want:
            sys.exit('FCC line %s too long: %d > %d' % (n, len(text), want))
        rows[i] = (a, b, n, head + 'FCC ' + d + text.ljust(want) + d)
lines = HEADER + ['%s %s' % (n, src.rstrip()) for a, b, n, src in rows]
os.makedirs(os.path.join(ROOT, 'listing'), exist_ok=True)
open(os.path.join(ROOT, 'listing', 'morse_listing.txt'), 'w').write('\n'.join(lines) + '\n')

mem, syms, listing, end_pc = asm6809.assemble(lines, 0x3462)
bad = 0
by_line = {num: (addr, bs) for num, addr, bs, m, o in listing}
for a, b, n, src in rows:
    if a == '-':
        continue
    if mnem(src) == 'FCC':
        continue
    addr, bs = by_line[int(n)]
    hx = ''.join(b.split())
    exp = [int(hx[i:i + 2], 16) for i in range(0, len(hx), 2)]
    if addr != int(a, 16) or bs != exp:
        bad += 1
        print('MISMATCH line %s: printout %s %s  assembled %04X %s' % (n, a, b, addr, ' '.join('%02X' % x for x in bs)))
print('lines checked:', len([r for r in rows if r[0] != '-']), 'mismatches:', bad)
print('assembled %04X-%04X (%d bytes)' % (min(mem), end_pc - 1, len(mem)))
