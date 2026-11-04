# make        rebuild everything and run the checks (both versions of the program)
all:
	python3 tools/build_listing.py
	python3 tools/make_patched_listing.py
	python3 tools/build_game.py
	python3 tools/build_game.py patched
	python3 tools/build_page.py
	python3 tools/build_listing_html.py
	node tests/transmit.js
	node tests/receive.js
	node tests/audio.js
	node tests/audiosync.js
	MORSE_VARIANT=patched node tests/receive.js
	MORSE_VARIANT=patched node tests/audio.js

# real on-air recording (not in git of anything; see CLAUDE.md): MORSE_VARIANT=patched TEMPO=0.5 node tests/onair.js tests/samples/onair/i8qfk.mp3 420 60 1300
