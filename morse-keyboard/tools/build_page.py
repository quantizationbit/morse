"""Inline CPU, machine, font and program image into dist/morse_keyboard.html (single self-contained file)."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda *p: open(os.path.join(ROOT, *p)).read()

# 5x7 dot font for screen codes 0x20..0x5F: five column bytes per glyph, bit 0 = top row (standard 5x7 shapes; the up and left
# arrows at 0x5E and 0x5F are drawn by hand because the 6847's arrow glyphs replace ^ and _).
GLYPHS = """
20 00 00 00 00 00 | 21 00 00 5F 00 00 | 22 00 07 00 07 00 | 23 14 7F 14 7F 14 | 24 24 2A 7F 2A 12 | 25 23 13 08 64 62
26 36 49 55 22 50 | 27 00 05 03 00 00 | 28 00 1C 22 41 00 | 29 00 41 22 1C 00 | 2A 14 08 3E 08 14 | 2B 08 08 3E 08 08
2C 00 50 30 00 00 | 2D 08 08 08 08 08 | 2E 00 60 60 00 00 | 2F 20 10 08 04 02 | 30 3E 51 49 45 3E | 31 00 42 7F 40 00
32 42 61 51 49 46 | 33 21 41 45 4B 31 | 34 18 14 12 7F 10 | 35 27 45 45 45 39 | 36 3C 4A 49 49 30 | 37 01 71 09 05 03
38 36 49 49 49 36 | 39 06 49 49 29 1E | 3A 00 36 36 00 00 | 3B 00 56 36 00 00 | 3C 08 14 22 41 00 | 3D 14 14 14 14 14
3E 00 41 22 14 08 | 3F 02 01 51 09 06 | 40 32 49 79 41 3E | 41 7E 11 11 11 7E | 42 7F 49 49 49 36 | 43 3E 41 41 41 22
44 7F 41 41 22 1C | 45 7F 49 49 49 41 | 46 7F 09 09 09 01 | 47 3E 41 49 49 7A | 48 7F 08 08 08 7F | 49 00 41 7F 41 00
4A 20 40 41 3F 01 | 4B 7F 08 14 22 41 | 4C 7F 40 40 40 40 | 4D 7F 02 0C 02 7F | 4E 7F 04 08 10 7F | 4F 3E 41 41 41 3E
50 7F 09 09 09 06 | 51 3E 41 51 21 5E | 52 7F 09 19 29 46 | 53 46 49 49 49 31 | 54 01 01 7F 01 01 | 55 3F 40 40 40 3F
56 1F 20 40 20 1F | 57 3F 40 38 40 3F | 58 63 14 08 14 63 | 59 07 08 70 08 07 | 5A 61 51 49 45 43 | 5B 00 7F 41 41 00
5C 02 04 08 10 20 | 5D 00 41 41 7F 00 | 5E 04 02 7F 02 04 | 5F 08 1C 2A 08 08
"""
font = []
for g in GLYPHS.replace('\n', ' | ').split('|'):
    b = g.split()
    if not b:
        continue
    assert len(b) == 6, b
    assert int(b[0], 16) == 0x20 + len(font), b[0]
    font.append(''.join(b[1:]))
assert len(font) == 64

games = {}
for name, f in (('original', 'game.json'), ('patched', 'game_patched.json')):
    g = json.loads(rd('build', f))
    g['syms'] = {k: v for k, v in g['syms'].items() if k in ('BEGIN', 'TABLE', 'XFLG', 'RFLG', 'TVAL', 'ISPD', 'RC', 'CHRCV')}
    games[name] = g
cal = json.loads(rd('build', 'calibration.json'))
t = rd('src', 'page.template.html')
t = t.replace('/*CPU*/', rd('src', 'cpu6809_core.js')).replace('/*MACHINE*/', rd('src', 'machine.js')).replace('/*AUDIOIN*/', rd('src', 'audioin.js'))
t = t.replace('/*CYC*/', rd('src', 'cyc.json').strip())
t = t.replace('/*FONT*/', json.dumps(font))
t = t.replace('/*DATA*/', json.dumps({"games": games, "pollDelay": cal["pollDelay"]}, separators=(',', ':')))
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
open(os.path.join(ROOT, 'dist', 'morse_keyboard.html'), 'w').write(t)
print('wrote dist/morse_keyboard.html', len(t), 'bytes')
