"""Stage the deployable site under ../site/morse/ (nothing outside the project is touched).
index.html is dist/morse_keyboard.html; the listing pages move to listing/ and their back link points at ../ instead of the local file name."""
import os, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), 'site', 'morse')
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(os.path.join(OUT, 'listing'))
shutil.copy(os.path.join(ROOT, 'dist', 'morse_keyboard.html'), os.path.join(OUT, 'index.html'))
src = os.path.join(ROOT, 'dist', 'listing')
for f in sorted(os.listdir(src)):
    data = open(os.path.join(src, f), encoding='utf-8').read()
    if f.endswith('.html'):
        assert 'href="../morse_keyboard.html"' in data
        data = data.replace('href="../morse_keyboard.html"', 'href="../"')
    open(os.path.join(OUT, 'listing', f), 'w', encoding='utf-8').write(data)
print('staged', OUT)
