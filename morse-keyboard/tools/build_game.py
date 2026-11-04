"""Assemble listing/morse_listing.txt (ORG $3462, as printed) into build/game.json."""
import json, base64, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import asm6809
variant = sys.argv[1] if len(sys.argv) > 1 else ''          # '' or 'patched'
src = open(os.path.join(ROOT, 'listing', 'morse_listing%s.txt' % ('_' + variant if variant else ''))).read().splitlines()
mem, syms, listing, end_pc = asm6809.assemble(src, 0x3462)
lo, hi = min(mem), max(mem)
blob = bytes(mem.get(a, 0) for a in range(lo, hi + 1))
os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
json.dump({"org": lo, "code": base64.b64encode(blob).decode(), "syms": syms}, open(os.path.join(ROOT, 'build', 'game%s.json' % ('_' + variant if variant else '')), 'w'))
print('assembled %d bytes, %04X-%04X' % (len(mem), lo, hi))
