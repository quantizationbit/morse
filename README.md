# Morse Keyboard

A Radio Shack Color Computer Morse code program, recovered from a printout of the original 6809 assembly source
(823 lines, checked against every address and object byte of the printout) and running in the browser. The original
program runs unmodified in a JavaScript 6809 emulator. It can transmit and receive Morse.

- Try it: https://quantizationbit.github.io/morse/
- Annotated source listings: https://quantizationbit.github.io/morse/listing/morse_listing.html

## Layout

- `morse-keyboard/` has the source, transcripts of the printout, build tools and tests. See `morse-keyboard/CLAUDE.md` for the layout, what was verified, and the quirks of the original program. Run `make` there (needs python3 and node) to rebuild and check.
- `site/morse/` is the published website. GitHub Actions publishes it to GitHub Pages on every push to `main`.

The program is also available as a single self-contained file at `morse-keyboard/dist/morse_keyboard.html`.

## Notes

No audio files are included. Some tests and the Recording panel use outside recordings that are not redistributed here
(the page can fetch a public recording from archive.org when a visitor selects it). The pages load Google Fonts, and fall
back to system fonts if that request is blocked.

## License

The Unlicense (public domain). See `LICENSE`.
