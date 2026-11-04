# Morse Keyboard (CoCo recovery)

Browser version of Bill's Color Computer Morse program. Same approach as `../../divingbell/diving-bell`: the original 6809 code
runs unmodified in a JS emulator. The printout was a 22-page scan (`../morse scan 10-22-2026 05.38.pdf`) of an EDTASM listing
with addresses, object bytes and a symbol table.

## Layout
- `work/transcript_*.txt` - hand transcription of the scan, one line per listing line: `ADDR|OBJECT BYTES|LINE NO|SOURCE`.
- `tools/build_listing.py` - writes `listing/morse_listing.txt` (source only, 5-digit line numbers) from the transcript, assembles it at
  ORG $3462 and compares EVERY address and object byte to the printout. Last run: 823 lines, 0 mismatches, $3462-$3D83 (2338 bytes).
  FCC strings are padded to the length the printout's addresses imply.
- `tools/asm6809.py` - the divingbell assembler plus comment lines, EQU, FCC, and 16-bit indexed offsets for symbolic offsets.
- `tools/build_game.py [patched]` -> `build/game.json` / `build/game_patched.json`. `tools/build_listing_html.py` + `tools/listing_notes.py` -> `dist/listing/*.html` (annotated, like divingbell). `tools/build_page.py` -> `dist/morse_keyboard.html` (also holds the 5x7 screen font).
- `src/cpu6809_core.js` - copied unchanged from divingbell (differential-tested there). `src/cyc.json` - divingbell's cycle table with two fixes: TFR 7 -> 6 and JMP extended 3 -> 4
  (found by auditing 73 opcodes against the 6809 data sheet; the other 71 matched. Neither is in a timing loop. Divingbell's copy still has the old values).
- `src/machine.js` - CoCo model: RAM, stub POLCAT, PIA0/PIA1, DAC capture, cassette relay (transmit key), cassette input (receive key),
  `MorseCoCo.link(a, b)` wires one station's relay to another's cassette input.
- `src/page.template.html` - UI. `tests/` - `transmit.js`, `receive.js`, `calibrate.js`, shared `harness.js`.
- `build/calibration.json` - POLCAT stub delay (see below).

## Hardware the program uses
- Text screen at $0400 (32x16): alpha with CSS=1 (orange), plus semigraphics-4 cells ($EF, $DF, $9F, $AF, $C6, $EC) for the header bar and indicators.
- Transmit: tone is square wave written to the DAC ($FF20) while the cassette relay ($FF21 bit 3) is on. The relay is the transmitter key line.
- Receive: reads bit 0 of $FF20 (cassette input comparator). With the radio's earphone audio on the cassette input (how the user ran it) bit 0 is the waveform's polarity: it flips at the tone's
  frequency during a tone and sits at `IR` = 255 (1) when there is none. The page's tone decoder mode instead gives it a clean keyed line (bit 0 = 0 while key down); both are valid inputs. See Timer below.
- Keyboard: `JSR [$A000]` is Color BASIC POLCAT. Codes: Up $5E = transmit, Down $0A = receive, Left $08 backspace, Right $09 restart, Break $03, Clear $0C.
- Program starts in receive mode (RFLG is 1 after START).

## Facts to keep straight
- POLCAT is a stub that burns cycles. The program calls it hundreds of times per dit, so sending speed depends on its cost.
  The delay (111) was chosen so a dit tone lasts 1.2/WPM seconds (60.0 ms at 20 WPM). That cost is inferred, not read from the printout.
  The printout's constant 1410 (TVAL = 1410/WPM) only works out for a POLCAT of roughly 570 cycles, which is plausible for Color BASIC.
- The program's own sending rhythm, measured: dit 1, dah 3, gap inside a letter 0.43, letter gap 2.2, word gap 5.6 (in dits).
  Receive timing is learned from the first two tones that differ by 1.5x, then a letter gap is declared at about 1.33x the measured
  gap before the second tone. It only works with short gaps inside a letter, so it decodes this program's own output, not standard 1:3:7 Morse.
- The first letter received is used up calibrating. Send a V first. The page's Station B does this by default.
- Word-gap loop at R18 (line 07460) has no keyboard poll, so it times out about 35 ms after each letter and prints a blank. So received text
  shows a space after every letter. This is the printed code, not an emulation error.
- One uncertain read: line 01630 (`CMPX #$040F` at $375F) is cut off at the page break in the scan. $040F is the only value that makes the
  2-digit speed entry work, so it is used. The object bytes there could not be checked against the printout.
- Receive input sources: Station B (a second emulated copy of the program, lockstep) and a straight key (button or Ctrl). Microphone input is not implemented.

## Recordings (mp3 / aac / wav) as receive input
- `src/audioin.js` is the shim. `MorseAudioIn.detect(pcm, rate)` finds the loudest steady tone (Goertzel scan 300-2400 Hz), detects it
  synchronously (mix with sin/cos, 4 ms low-pass) and runs a Schmitt trigger, giving a per-sample key array. Noise outside the tone's
  band drops out. `machine.setAudioInput(pcm, rate, startCycle, key)` presents it on bit 0 of $FF20 by CPU cycle (key down = 0).
  Passing no `key` gives the raw zero-crossing comparator instead (low half of the waveform = 0, silence = 1).
- The page decodes files with `decodeAudioData` (Recording panel, either input mode). `tests/samples/` has a 1300 Hz mp3.
- `tests/audio.js` makes tones, runs them through real ffmpeg mp3 and aac encode+decode, adds noise, feeds the result in.
  Tone decoder mode: passes at 600, 700, 1000, 1500 Hz with noise, both codecs.
- Raw comparator mode is pitch sensitive in the emulation. The program samples the line once per polling pass (~700 cycles), so it only
  decodes when the tone period lines up with that rate. Lucky pitches follow the loop period (about 1250-1400 Hz at the calibrated
  POLCAT cost, 1170-1280 Hz in finer scans). The user recalls the real preferred pitch as roughly 1200-1500 Hz, which is consistent with this.
  No POLCAT delay made the whole band reliable (scan in the session log), so the POLCAT cost estimate is still unconfirmed.
- Standard 1:3:7 timing does not decode with the printed receiver (see Facts above); it does with the patched one.
- Not in this listing: any SAM clock-speed write ($FFD6-$FFD9; the only $FFxx addresses are $FF01, $FF20-$FF23), any code that counts
  zero crossings to measure pitch, and any code that reprints earlier output after learning the timing (CHRCV is only called from PUT and
  the R18 blank). The user remembers those features, so a different version of the program may exist.

## Patched receiver (the user approved this, "option 2")
- `listing/morse_listing.txt` is the printout, untouched. `listing/morse_listing_patched.txt` is made by `tools/make_patched_listing.py`, which asserts the
  original lines it replaces. Two changes, 16 lines differ: (1) letter-gap threshold `TSP` = 2.25 x `TMID` + 25 (lines 06300-06400) instead of 4 x the gap before the
  second calibration tone; (2) word-gap threshold `TEMP` = 1.5 x `TMID`, and `R18` now polls the keyboard (07420-07466). Sending code is identical.
- Build the patched image with `python3 tools/build_game.py patched` (-> `build/game_patched.json`). Tests run it with `MORSE_VARIANT=patched`.
- Why: the printed receiver only fits this program's own rhythm (gap inside a letter 0.43 dit). With ordinary spacing every element becomes its own letter, and the
  R18 word-gap loop (30 cycles per pass, no keyboard poll) times out about 35 ms after each letter. Neither is an emulation error; it is what the printed code does.
- Results with the patched receiver: own sender via audio and via the two-station link, with words spaced correctly; synthetic 1:3:7 timing at 15 WPM ("VV CQ CQ DE W6XYZ");
  and real on-air CW (below). The as-printed receiver still gives E and T strings on standard timing.
- The page defaults to the patched version (Program panel); Station B always runs the printed program.

## Real on-air test (2021-11-21 Italian ragchew, 7036 kHz, I8QFK / IZ8VKW / IU1MRY)
- File: `tests/samples/onair/i8qfk.mp3` (1.9 MB, 957 s, 8 kHz mono), from the SWLing Post article "Large archive of CW off-air recordings from Italy".
  No licence stated, so keep it local and do not republish. Fetching it needed a Referer header (plain curl got 403).
- `tests/analyze.js` reports tone pitch and keying speed (about 540 Hz, 30-36 WPM, dit 34 ms, ordinary spacing). `tests/refdecode.js` decodes the detector output with an
  independent adaptive decoder and reads real Italian, so the detector and signal are sound.
- `tests/onair.js file start len targetHz [wpm] [raw]` (env `TEMPO=0.5` slows it, `NOTRIM=1`, `RUNS=n` prints key runs). Start the program after a word gap with silence ahead:
  it learns dit and dah once from the first tones, so a window that starts mid-letter gives bad thresholds.
- Pitch shift is a heterodyne (`src/freqshift.js`, Hilbert via FFT). Do NOT use ffmpeg `asetrate + atempo`: WSOLA chops a pure tone into 16 ms blips and the program sees garbage.
  In tone decoder mode the pitch does not matter at all; the shift only matters for the raw zero-crossing mode.
- Patched receiver, tone decoder mode, tempo 0.45 / 0.55 / 0.65 / 1.0 (16 / 20 / 23 / 36 WPM), window 420 s: `EA A T UTTI E D UE E GRAZIE PER AVERMI FATT O ENTRARE CARO L A LUIGI @ PER I I Z 8 VKW RST 5NN`.
  The reference decoder reads `BUONA SERA A TUTTI E DUE E GRAZIE PER AVERMI FATTO ENTRARE CARO LUIGI = PER IIZ8VKW RST 5NN`. Small errors: letters split at long dahs or pauses.
  As printed: strings of E and T at every pitch and speed tried.

## Version note (from the user)
The user believes this printout is not the final version of the program; the final one picked up received code "ok". That fits what is missing here:
retyping after learning, zero-crossing pitch counting, any clock change, and sane word spacing. Treat the receive-side quirks above as properties of THIS listing.
If a later listing, tape or disk image turns up, run it through the same pipeline (transcribe, `build_listing.py` byte check, tests).

## Sound in the page (audio clock drives the emulation)
- ScriptProcessor callback pulls one emulated field (1/60 s) per `audioFrame`: `stepField()` then `A.audioFrame(rate)`. Sound, key lamps and the program share one clock.
  Without a running AudioContext (before the first click) the page falls back to the screen timer. Muting keeps the audio clock driving, with silence.
- What you hear: transmit = the program's DAC square wave (about 1170 Hz, one 766-cycle pass per cycle, only while the relay is on and the mux selects the DAC);
  receive from Station B = a 700 Hz sine sidetone from its key line; receive from a recording = the recording itself.
- The relay ($FF21 bit 3, the "Key out" lamp) is what the user's real hardware used: the output drove a relay that keyed the transmitter.
- `tests/audiosync.js` checks (no ears needed): silent while key up, tone only while key down at 1170 Hz, the line the program reads equals the detector key at the same cycle,
  each field's audio equals the recording at that field's emulated instant, and total drift (the emulated clock runs 0.01% ahead of the sample clock because instructions overshoot the field edge).
- Browser check: with sound on, Station B's 15 characters took 11.5 s of wall time and a 12.2 s mp3 played in 12.5 s, both decoded. Actual loudness and quality are untested by ear.
- Volume slider and the Sound button; the status bar shows "click the screen" until the browser allows audio.
- The user said (late in the session) they once wrote a slow scan television receiver after this program; it was never printed, so it is lost.

## 1942 War Department code course (public domain likely) and deployment
- `tests/samples/usafi/20B_Sixteen_Words_Per_Minute_64kb.mp3` (2,428,045 bytes, 303 s, 22.05 kHz mono) from archive.org item `U.S._Armed_Forces_Institute_Basic_Radio_Code_ca1942`
  (War Dept Special Service Division, about 1942; uploaded by AF2Z). The item has no rights field; the Public Domain Mark is on the linked TM 11-459 page. A US government work.
- Content: five-character groups of letters and digits at about 20 WPM (dit 60 ms, in-letter gap 48 ms, tone 665 Hz), not English prose. Patched receiver decodes it essentially
  perfectly (first group's first letter is used up learning); the as-printed receiver gives E and T strings (in-letter gap is 0.8 dit).
- The page's Recording panel has a preset and a URL box that fetch it from archive.org on demand (CORS allowed). Other tracks in the item (6, 8, 10, 12 WPM) are untested.
- Deployment follows divingbell: `tools/stage_site.py` stages `../site/morse/`; `../site/DEPLOY.md` has the sudo copy commands and Caddy block (the user runs them; never touch
  /etc/caddy or /var/www from here, never run `caddy stop`).

## The timer (as the user describes it, checked against the code)
- User's recollection: cassette input from the radio earphone jack; the timer times the polarity of the incoming audio; short polarity switches are ignored, counting continues
  toward the tone, and "no tone" is detected. The same technique found the tone for Morse and for SSTV. This matches the printed receiver: R50/R60 require 25 consecutive idle readings
  (about 25 cycles each, 0.7 ms) before a tone is considered over, which makes a tone's own half-cycles (pitch above about 700 Hz) and brief noise "short polarity switches".
- Pitch is NOT measured in this listing; only presence and duration. The pitch-finding part the user remembers is not in the printout.
- Measured in the emulator, raw comparator, own rhythm at 20 WPM (true tones 60 ms dit, 180 ms dah): at 1200 Hz the program records about 240 counts per dit and 650 per dah (inflated about 3x, because each
  failed 25-reading window adds its readings to the count, but steady); at 1300 Hz dits range 72-134 and dahs 133-337 (the tone's flips slide slowly against the ~696-cycle sampling loop, beat period about the dit length).
  Raw mode decodes at 1200, 1400 and 1800 Hz and not at 800-1100, 1300, 1500, 1600 Hz; noise (0.03) and pitch wobble (15 Hz) do not widen that; noise 0.1 breaks it. The user recalls roughly 1200-1500 Hz as the working band.
- The real POLCAT cost is still unknown; it sets the loop rate and therefore which pitches line up.

## Header indicators (user pointed these out; checked in the emulator)
- `$0400`/`$0401` (top-left): swap `$9F` yellow / `$AF` blue at tone start (R15) and tone end (R45) in the decode phase only. Nothing flashes there while learning (FLAG/T1/T2 phase);
  the first flash follows calibration (4th tone of a V). The sender swaps them per element (GMC and the end of SOUND). `$0405` flips `$C6`/`$C9` after each letter, `$0403` flips on each RCVR restart.
- The user thought the flashing indicates learning the pacing; in this listing it indicates the pacing is already learned. May differ in their final version.
