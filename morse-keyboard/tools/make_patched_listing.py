"""Build listing/morse_listing_patched.txt: the printed listing plus two receive-side changes so ordinary-rhythm CW can decode.
The original listing stays untouched. Each edit asserts the original lines it replaces, so it fails loudly if the listing changes.

1. TSP (letter-gap threshold, lines 06300-06440). Original: from the idle gap before the second calibration tone,
   TSP = 4 x that gap, or TMID when 3.5 x gap exceeds TMID. That only fits this program's own short in-letter gaps (0.43 dit); with
   ordinary 1-dit gaps it declares a letter end inside every letter. New: TSP = 2.25 x TMID + 25. R14 counts 3 per pass from TIME (25),
   so a letter ends after 0.75 x TMID passes, about 1.5 dits of silence for a 1:3 dit/dah ratio.
2. TEMP (word-gap threshold, lines 07420-07450) and R18. Original: TEMP = 2 x T3 + T2 counted in a 30-cycle loop with no keyboard poll,
   so it timed out about 35 ms after every letter. New: R18 polls the keyboard like every other loop, and TEMP = 1.5 x TMID passes
   (about 3 dits more, so a blank prints after roughly 4.5 dits of silence).
"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'listing', 'morse_listing.txt')).read().splitlines()

def swap(lines, first, last, new, expect):
    i = next(k for k, l in enumerate(lines) if l.startswith(first + ' '))
    j = next(k for k, l in enumerate(lines) if l.startswith(last + ' '))
    got = [' '.join(l.split()[1:]) for l in lines[i:j + 1]]
    assert got == expect, (first, got)
    return lines[:i] + new + lines[j + 1:]

lines = swap(src, '06300', '06440', [
    '06300         LDD TMID', '06310         LSRA', '06320         RORB', '06330         LSRA', '06340         RORB',
    '06350         STD TEMP', '06360         LDD TMID', '06370         ADDD TMID', '06380         ADDD TEMP',
    '06390         ADDD #25', '06400         STD TSP'],
    ['LDD TSP', 'LSRA', 'RORB', 'STD TEMP', 'ADDD TSP', 'ADDD TSP', 'ADDD TSP', 'CMPD TMID', 'BGT SKP2', 'CMPD TF', 'BGT SKP1',
     'SKP2 LDD TMID', 'SUBD TEMP', 'SKP1 ADDD TEMP', 'STD TSP'])
lines = swap(lines, '07420', '07460', [
    '07420         LDD TMID', '07430         LSRA', '07440         RORB', '07445         ADDD TMID', '07450         STD TEMP',
    '07460 R18     LEAX 1,X', '07462         PSHS X', '07464         LBSR UPSTK', '07466         PULS X'],
    ['LDD T3', 'ADDD T3', 'ADDD T2', 'STD TEMP', 'R18 LEAX 1,X'])
open(os.path.join(ROOT, 'listing', 'morse_listing_patched.txt'), 'w').write('\n'.join(lines) + '\n')
print('wrote listing/morse_listing_patched.txt')
