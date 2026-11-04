"""Render the original and patched Morse keyboard listings as syntax-highlighted (Monokai-style) HTML pages next to the .txt files.

Usage: python3 tools/build_listing_html.py [outdir]   (default: dist/listing)
Line format: 5-digit line number, space, optional label, opcode, operand (no spaces), free-text comment.
"""
import html, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from listing_notes import HARDWARE_INTRO, MEMORY_MAP, NOTES, OVERVIEW, TRY_IT

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'listing')

DIRECTIVES = {'FCB', 'FDB', 'RMB', 'END', 'ORG', 'EQU', 'FCC', 'FCS', 'SETDP'}
NO_OPERAND = {'RTS', 'RTI', 'NOP', 'MUL', 'SWI', 'SEX', 'DAA', 'ABX', 'DECA', 'DECB', 'INCA', 'INCB', 'CLRA', 'CLRB',
              'LSLA', 'LSLB', 'LSRA', 'LSRB', 'NEGA', 'NEGB', 'COMA', 'COMB', 'ASLA', 'ASLB', 'ASRA', 'ASRB',
              'ROLA', 'ROLB', 'RORA', 'RORB', 'TSTA', 'TSTB'}
REG_LIST_OPS = {'PSHS', 'PULS', 'PSHU', 'PULU', 'TFR', 'EXG'}
REGS = {'A', 'B', 'D', 'X', 'Y', 'U', 'S', 'PC', 'CC', 'DP'}
TOKEN = re.compile(r'\$[0-9A-Fa-f]+|\d+|[A-Za-z_][A-Za-z0-9_]*|.', re.S)

FILES = [
    ('morse_listing', 'Morse Keyboard source listing',
     'Transcription of the printout, exactly as written, with notes on how it works.', False),
    ('morse_listing_patched', 'Morse Keyboard source listing, patched',
     'The same program with two receive-side changes, highlighted below, so ordinary Morse spacing decodes.', True),
]


def span(cls, text):
    return '<span class="%s">%s</span>' % (cls, html.escape(text)) if text else ''


def md(text):
    """Escape text and turn `code` spans into <code>."""
    return re.sub(r'`([^`]+)`', r'<code>\1</code>', html.escape(text, quote=False))


def notes_html(num, which):
    items = NOTES.get(num, [])
    if isinstance(items, tuple):
        items = [items]
    out = ''
    for item in items:
        title, paras = item[0], item[1]
        if len(item) > 2 and item[2] != which:
            continue
        out += '<span class="nb"><b>%s</b>%s</span><!--n-->' % (
            html.escape(title), ''.join('<span class="np">%s</span>' % md(p) for p in paras))
    return out


def memory_html():
    rows = ''.join('<tr><th scope="row">%s</th><td>%s</td></tr>\n' % (html.escape(rng), md(use)) for rng, use in MEMORY_MAP)
    return ('<section class="mem"><h2>What this program does</h2>%s</section>\n'
            '<section class="mem"><h2>The hardware it uses</h2>%s\n<div class="tbl"><table>\n'
            '<thead><tr><th>Address</th><th>What the program keeps or does there</th></tr></thead>\n'
            '<tbody>\n%s</tbody></table></div></section>\n'
            '<section class="mem"><h2>Trying it</h2>%s</section>' % (
                ''.join('<p>%s</p>' % md(p) for p in OVERVIEW), ''.join('<p>%s</p>' % md(p) for p in HARDWARE_INTRO), rows,
                ''.join('<p>%s</p>' % md(p) for p in TRY_IT)))


def operand_html(op, mnem):
    out, reg_list = [], mnem in REG_LIST_OPS
    toks = TOKEN.findall(op)
    for i, t in enumerate(toks):
        prev = toks[i - 1] if i else ''
        nxt = toks[i + 1] if i + 1 < len(toks) else ''
        if t[0] == '$' or t.isdigit():
            out.append(span('num', t))
        elif t.upper() in REGS and (reg_list or prev in (',', '-') or nxt == ','):
            out.append(span('reg', t))
        elif t[0].isalpha() or t[0] == '_':
            out.append(span('sym', t))
        elif t == '#':
            out.append(span('imm', t))
        else:
            out.append(span('punc', t))
    return ''.join(out)


def line_html(raw):
    num, rest = raw[:5], raw[6:]
    m = re.match(r'(\S*)(\s+)(\S+)(\s*)(\S*)(.*)$', rest)
    if not m:
        return num, span('cm', rest)
    label, s1, mnem, s2, operand, tail = m.groups()
    if not label and not rest[:1].isspace():
        label = ''
    if mnem.upper() in NO_OPERAND:                   # nothing to take as an operand: the rest is comment
        operand, tail, s2 = '', (s2 + operand + tail), ''
    body = span('lbl', label) + html.escape(s1)
    body += span('dir' if mnem.upper() in DIRECTIVES else 'op', mnem) + html.escape(s2)
    body += operand_html(operand, mnem.upper()) + span('cm', tail)
    return num, body


def listing_lines(stem):
    return open(os.path.join(ROOT, 'listing', stem + '.txt')).read().rstrip('\n').split('\n')


def build(stem, title, blurb, patched):
    raw = listing_lines(stem)
    orig = set(listing_lines('morse_listing')) if patched else set()
    rows, changed = [], 0
    for ln in raw:
        num, body = line_html(ln)
        is_new = patched and ln not in orig
        changed += is_new
        cls = ' class="patch"' if is_new else ''
        rows.append(notes_html(num, 'patched' if patched else 'orig'))
        rows.append('<span id="L%s"%s><a class="ln" href="#L%s">%s</a> %s</span><!--e-->' % (num, cls, num, num, body))
    size = os.path.getsize(os.path.join(ROOT, 'listing', stem + '.txt')) // 1024
    other = 'morse_listing.html' if patched else 'morse_listing_patched.html'
    other_label = 'Original listing' if patched else 'Patched listing'
    note = ('<p class="note"><span class="swatch"></span> The %d highlighted lines are the changes: how the letter-gap threshold <code>TSP</code> is worked out '
            '(lines 06300 to 06400), and the word-gap threshold <code>TEMP</code> with a keyboard poll added to <code>R18</code> (lines 07420 to 07466). '
            'Everything else is as printed.</p>' % changed) if patched else ''
    page = PAGE.format(title=title, blurb=blurb, stem=stem, size=size, other=other, other_label=other_label,
                       note=note, memory=memory_html(), code=''.join(rows))
    path = os.path.join(OUT, stem + '.html')
    os.makedirs(OUT, exist_ok=True)
    open(path, 'w').write(page)
    open(os.path.join(OUT, stem + '.txt'), 'w').write('\n'.join(raw) + '\n')
    return path, raw


PAGE = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{blurb}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&family=Silkscreen:wght@400;700&display=swap">
<style>
:root {{
  --abyss: #0b1623; --silt: #1d3a52; --foam: #e8f1f5; --mist: #93aab8; --ember: #ff8a1f;
  --display: 'Silkscreen', 'Courier New', monospace;
  --body: 'IBM Plex Sans', system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  /* Monokai, as in Sublime Text */
  --bg: #272822; --fg: #f8f8f2; --gutter: #75715e; --cm: #75715e; --op: #f92672; --dir: #66d9ef;
  --lbl: #a6e22e; --num: #ae81ff; --reg: #fd971f; --patch: #3e3d1f; --patch-edge: #e6db74;
  color-scheme: dark;
}}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; }}
body {{ background: var(--abyss); color: var(--foam); font: 16px/1.55 var(--body); padding: 24px 16px 48px; }}
.wrap {{ max-width: 960px; margin: 0 auto; }}
h1 {{ font: 700 clamp(22px, 5vw, 32px)/1.1 var(--display); letter-spacing: .04em; text-transform: uppercase; margin: 0; }}
h1 span {{ color: var(--ember); }}
.sub {{ color: var(--mist); margin: 8px 0 0; }}
nav {{ display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 16px 0; }}
a {{ color: var(--ember); }}
a:focus-visible {{ outline: 2px solid var(--foam); outline-offset: 2px; }}
.note {{ color: var(--mist); font-size: 14px; margin: 0 0 12px; }}
.swatch {{ display: inline-block; width: 12px; height: 12px; background: var(--patch); border-left: 3px solid var(--patch-edge); vertical-align: -1px; }}
.code {{ background: var(--bg); border: 1px solid var(--silt); border-radius: 8px; overflow-x: auto; padding: 12px 0; }}
pre {{ margin: 0; width: max-content; min-width: 100%; color: var(--fg); font: 400 14px/1.5 var(--mono); tab-size: 8; }}
pre > span:not(.nb) {{ display: block; padding: 0 16px 0 12px; border-left: 3px solid transparent; white-space: pre; }}
pre > span.patch {{ background: var(--patch); border-left-color: var(--patch-edge); }}
pre > span:target {{ background: #49483e; }}
.mem {{ margin: 0 0 20px; padding: 16px; background: #112638; border: 1px solid var(--silt); border-radius: 8px; }}
.mem h2 {{ font: 400 13px var(--display); letter-spacing: .12em; text-transform: uppercase; color: var(--ember); margin: 0 0 12px; }}
.mem p {{ margin: 0 0 10px; }}
.mem code, .nb code {{ font: 400 .9em var(--mono); color: var(--foam); background: rgba(255,255,255,.08); padding: 0 4px; border-radius: 3px; }}
.tbl {{ overflow-x: auto; margin-top: 14px; }}
table {{ border-collapse: collapse; width: 100%; min-width: 640px; font-size: 14px; }}
th, td {{ text-align: left; vertical-align: top; padding: 6px 10px; border-top: 1px solid var(--silt); }}
thead th {{ color: var(--mist); font-weight: 500; border-top: 0; }}
tbody th {{ font: 500 13px var(--mono); white-space: nowrap; color: var(--foam); }}
td.rom {{ background: repeating-linear-gradient(135deg, #2b3b49 0 6px, #243342 6px 12px); color: var(--mist); }}
td.ram {{ background: rgba(166,226,46,.12); }}
td.same {{ color: var(--mist); }}
#shownotes {{ margin: 4px 6px 12px 0; accent-color: var(--ember); }}
label[for=shownotes] {{ color: var(--mist); font-size: 14px; }}
#shownotes:focus-visible {{ outline: 2px solid var(--foam); outline-offset: 2px; }}
#shownotes:not(:checked) ~ .code .nb {{ display: none; }}
.nb {{ display: block; position: sticky; left: 0; box-sizing: border-box; width: min(82ch, calc(100vw - 64px)); margin: 12px 12px 8px 12px; padding: 10px 14px;
  white-space: normal; user-select: none; background: #1c2d3b; border-left: 3px solid #4f89b0; border-radius: 4px; color: #d6e2ea; font: 400 14px/1.5 var(--body); }}
.nb b {{ display: block; margin-bottom: 4px; font: 400 12px var(--display); letter-spacing: .1em; text-transform: uppercase; color: var(--ember); }}
.np {{ display: block; margin-top: 6px; }}
.np:first-of-type {{ margin-top: 0; }}
.ln {{ color: var(--gutter); text-decoration: none; user-select: none; }}
.ln:hover {{ color: var(--fg); }}
.cm {{ color: var(--cm); font-style: italic; }}
.op {{ color: var(--op); }}
.dir {{ color: var(--dir); }}
.lbl {{ color: var(--lbl); }}
.sym {{ color: var(--lbl); }}
.num {{ color: var(--num); }}
.reg {{ color: var(--reg); }}
.imm {{ color: var(--op); }}
</style>
</head>
<body>
<div class="wrap">
  <h1>Morse <span>Keyboard</span></h1>
  <p class="sub">{blurb}</p>
  <nav>
    <a href="../morse_keyboard.html">Back to the program</a>
    <a href="{other}">{other_label}</a>
    <a href="{stem}.txt" download>Download .txt ({size} KB)</a>
  </nav>
  {memory}
  {note}
  <input type="checkbox" id="shownotes" checked>
  <label for="shownotes">Show notes in the listing</label>
  <div class="code"><pre>{code}</pre></div>
</div>
</body>
</html>
'''


def plain(page):
    """Strip tags and notes from the code block back to the original text, to prove nothing was lost or reordered."""
    code = page.split('<pre>', 1)[1].split('</pre>', 1)[0]
    code = re.sub(r'<span class="nb">.*?<!--n-->', '', code, flags=re.S)
    return [html.unescape(re.sub(r'<[^>]+>', '', r)) for r in code.split('<!--e-->')[:-1]]


if __name__ == '__main__':
    for f in FILES:
        path, raw = build(*f)
        assert plain(open(path).read()) == raw, f[0]
        print('wrote', path, len(raw), 'lines')
