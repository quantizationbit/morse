"""Explanatory notes shown between the lines of the highlighted listing pages (not part of the printout).

NOTES maps a line number to (title, [paragraphs]) or a list of those. A third item 'orig' or 'patched' limits a note to one page.
Backticks mark code. Everything here comes from reading the listing and running it, so fix anything the author remembers differently.
"""

OVERVIEW = [
    "A Morse code keyboard for the Radio Shack Color Computer. In transmit mode you type text and it keys a transmitter and sounds "
    "a tone. In receive mode it listens to a tone decoder wired to the cassette input and prints what it hears. "
    "It runs on the screen's 32 by 16 text display, so there is no graphics and no sprites.",
    "Almost all of the program is timing loops. The 6809 has no timers, so every duration is made by counting passes of a loop "
    "whose cycle cost is known, at the Color Computer's 0.895 MHz clock. Every long loop calls Color BASIC's keyboard poll "
    "(`POLCAT`, through the vector at `$A000`) on each pass, so keys keep working while it sends or listens. That poll is also "
    "the main part of each pass's cost, which is why speeds come out right only with the real routine in place.",
    "In the browser, `POLCAT` is replaced by a small stand-in that burns the same number of cycles. Measured passes: the tone loop in `SOUND` "
    "about 766 cycles, the polling loops in the receiver about 690 to 700, the debounce loops 25, and the word-gap loop 30.",
]

HARDWARE_INTRO = [
    "The program touches only a few hardware addresses. `$FF20` is the sound DAC when written, and bit 0 reads the cassette input "
    "when read. Bit 3 of `$FF21` switches the cassette motor relay, which this program uses as the transmitter key. "
    "`$FF23` bit 3 enables sound, `$FF01` bit 3 selects the DAC as the sound source, and `$FF22` picks the text colors.",
    "Bit 0 of `$FF20` is the cassette input's comparator, a zero-crossing detector. With the radio's earphone audio plugged in, it is the polarity of the waveform: while a tone is present "
    "it flips at the tone's frequency, and with no tone it sits still at `IR`, which is 255, so a read of 1. The receiver times those flips, and counts passes of its loops to measure how long a tone lasts.",
    "It does not measure the pitch. It only needs to know whether a tone is there. A flip is not a tone; a tone is a stream of flips with no gap of 25 readings in a row at the idle level (see `R2`).",
]

TRY_IT = [
    "Open the program page and press S, type a speed such as 15 or 20, then press Enter. Up arrow is transmit mode, down arrow is receive. "
    "Station B on the page is a second copy of the program that sends to your receiver, and the Recording panel plays an mp3 or other audio file into it.",
    "As printed, the receiver decodes this program's own sending rhythm (a gap inside a letter of about 0.43 dit) but not ordinary Morse, where that gap is one dit. "
    "Tried on a real on-air recording (an Italian ragchew on 7036 kHz, about 36 WPM, played at 16 to 36 WPM), the printed program gives strings of E and T. "
    "The patched listing reads the same recording as text, for example `PER I I Z 8 VKW RST 5NN`, with the letters running together a little (`FATT O`, `L A LUIGI`) "
    "where a long dah or a pause falls near a threshold.",
    "The pitch of a recording does not matter in the page's tone decoder mode, which finds the tone and gives the program a clean on/off line. "
    "With the raw zero-crossing input, the program only decodes at certain pitches, because it samples the line once per polling pass. The usable pitches fall around 1200 to 1400 Hz.",
]

# (address range, what the program keeps there)
MEMORY_MAP = [
    ('$FF20', 'Written: 6-bit sound DAC (a square wave of $FC and $04 makes the tone). Read: bit 0 is the cassette input, the received key line.'),
    ('$FF21', 'Bit 3 is the cassette motor relay. Set while sending a tone, so it keys the transmitter.'),
    ('$FF22 / $FF23', '$FF22 is set to 8, the VDG color set bit, giving orange text. $FF23 bit 3 enables sound.'),
    ('$FF01', 'Bit 3 selects the sound source. Cleared for the tone, set again afterward.'),
    ('$A000', 'Vector to Color BASIC POLCAT, the keyboard poll. Returns a key in A, or zero.'),
    ('$0400-$05FF', 'The 32 x 16 text screen. Row 0 is the header. Rows 1 to 7 show received text, rows 8 to 14 show text you send, row 15 is the help line.'),
    ('$03E3', 'Top of the stack (set at START).'),
    ('$3462-$3D83', 'This program: variables first ($3465-$348C), then code, then the Morse table at $3D43. Entry is BEGIN at $3462.'),
    ('$3D83-$3FFE', 'The send buffer (STACK). BSTK is the next character to send, ESTK is where the next typed one goes.'),
]

NOTES = {
    '00100': ('What this program does', OVERVIEW),
    '00150': ('Variables', [
        "`ISPD` is the speed as two screen digits. `TVAL` is the length of one dit in units of loop passes. `BSTK` and `ESTK` are the head and tail of the send buffer. "
        "`NSS` and `NFLAG` track the speed digits being typed.",
        "`XFLG`, `RFLG`, `RSTR` and `JXMT` are flags set by the keyboard poll: send the buffer, go to receive mode, restart, go to transmit mode.",
        "The receiver's learned timing: `T1` and `T2` are the first two tone lengths, `TMID` the dit/dah dividing line, `TF` a noise floor, `T3` the longest plausible tone, "
        "`TSP` the letter-gap threshold. `RC` builds the received character one element at a time, and `MCT` counts its elements. `IR` is 255, the cassette input's idle level.",
    ]),
    '00420': ('START', [
        "Sets the border color `BCOL`, the stack, and the flags. `RFLG` is set to 1, so after the speed is entered the program starts in receive mode. "
        "`TIME` is 25, the number of consecutive idle readings needed to decide a tone has ended. Then it shows the instruction screen and waits for S.",
    ]),
    '00630': ('Text strings', [
        "Each string is copied to the screen with bit 6 set, which makes the characters display as normal text instead of inverse. The last character is sent with `$2E` so it "
        "ends up as `$6E`, the loop's stop marker. Lines are padded with spaces to fixed lengths so the next string starts at a known address.",
    ]),
    '00650': ('CONT', [
        "After the speed is typed it builds the main screen: the header row, the help line, and the two display areas, then falls into `XMIT`. The speed is copied "
        "from `ISPD` into the header at `$041B`.",
    ]),
    '00890': ('INST', [
        "Shows the instruction screen and waits until S is pressed. The `*` at the end of the text is the stop marker.",
    ]),
    '01140': ('CPIA', [
        "Sets up the peripheral chips. Interrupts are masked (`ORCC #$50`). It enables sound, sets the text color, and sets the sound source mux bit.",
    ]),
    '01240': ('RDSP: read the speed', [
        "Reads up to two digits with `POLCAT`, shows them at `$040D`, and handles backspace. A third digit overwrites the second. Enter stores them in `ISPD` "
        "and returns; a single digit is stored as the low byte.",
    ]),
    '01770': ('LDTMR: the speed constant', [
        "Turns the typed speed into `TVAL`. The two digits are converted to a number (tens times 10 plus ones), then the loop finds the largest X with WPM times X below 1410, minus one. "
        "So `TVAL` is about 1410 divided by the speed: 70 at 20 WPM.",
        "`SOUND` uses `TVAL` passes of its tone loop per dit. One pass costs about 766 cycles, which is why 1410 works out: 70 passes at 20 WPM is about 60 ms, the right length for a dit at that speed.",
    ]),
    '02090': ('CLS: the screen layout', [
        "Clears the display areas: rows 1 to 7 get `$60`, a block that shows as the received-text background, and rows 8 to 14 get `$20`, a dark block for the text you send. "
        "It also resets the send buffer and the screen pointers.",
    ]),
    '02290': ('UPSTK: the keyboard poll', [
        "Called from every timing loop. It polls the keyboard and acts on what it finds. Enter sets `XFLG` (send the buffer) and `JXMT` (switch to transmit mode if it is listening). Clear (12) empties the buffer. "
        "Down arrow (10) sets `RFLG`. Left arrow (8) backspaces. Up arrow (`$5E`) sets only `JXMT`. Break (3) clears the screen too. Right arrow (9) sets `RSTR`, which restarts.",
        "The cell at `$041D` in the header is rewritten on the way: a solid block while there is room in the buffer, and the character `$0D` once it reaches its limit.",
    ]),
    '02830': ('USC: any other key', [
        "A typed character is masked to six bits (`ANDA #63`), which is also its index into `TABLE`, stored at the buffer tail, and echoed in the send area by `CHROUT`.",
    ]),
    '02900': ('LBWC: next character to send', [
        "Takes the character at the head of the buffer and looks its Morse pattern up in `TABLE`, leaving it in B. If the buffer is empty it clears `XFLG` and goes to receive mode.",
    ]),
    '03020': ('GMC: send one character', [
        "B holds the pattern: a leading 1, then one bit per element, 1 for a dah and 0 for a dit. It shifts left until the leading 1 falls out, then sends each remaining bit "
        "with `SOUND`, Y = 1 for a dit and 3 for a dah. A pattern of 0 is a space and waits two `CDLY` delays. A normal character ends with one `CDLY`.",
    ]),
    '03260': ('SOUND: the tone', [
        "Turns on the relay (`$FF21` bit 3), selects the DAC, then writes `$FC` and `$04` alternately to `$FF20` for a square wave. Each pass is about 766 cycles, so the tone is near 1.2 kHz. "
        "X counts `TVAL` passes per dit unit and Y repeats that once for a dit or three times for a dah. Each pass also calls `UPSTK`, so typing is never missed.",
        "Afterwards the relay goes off and the program waits half a dit (`TVAL` divided by two, in `UPSTK` calls) before the next element. That is why the gap inside a letter is much shorter than the standard one dit.",
    ]),
    '03680': ('CHRCV: print a received character', [
        "Stores the character in the received-text rows and leaves a cursor block after it. When the area is full it scrolls up one line.",
    ]),
    '03980': ('CHROUT: print a typed character', [
        "Same for the send area, using `SBLOC` as the position.",
    ]),
    '04280': ('CDLY: the letter gap', [
        "A delay of two `UPSTK` calls for each of `TVAL` counts, so about two dits at the tone loop's rate. It is the pause after each character, and twice that for a space.",
    ]),
    '04380': ('BKSP', [
        "Takes the last typed character out of the buffer and off the screen.",
    ]),
    '04620': ('CLS1', [
        "Fills the whole screen with the color in `BCOL`. Used for the border bars at the top and bottom.",
    ]),
    '04680': ('XMIT: transmit mode', [
        "Sets the mode indicator and waits in a loop for the Enter key. Each pass calls `UPSTK`. When Enter has been pressed (`XFLG`), it sends the buffer, character by character, with `GMC`. When the buffer is empty it goes back to receive mode on its own.",
        "`RSTR` restarts and `RFLG` goes to `RCVR`.",
    ]),
    '05010': ('RCVR: receive mode', [
        "Clears the receive state (`FLAG` is zero until the first two tones are learned). Each loop here reads bit 0 of `$FF20`, ORs in `$FE` so only that bit is left, and compares with `IR`. "
        "Equal means the polarity is at the idle level. One such reading is not silence, because a tone's waveform spends half of each cycle there.",
    ]),
    '05100': ('R87: wait', [
        "Counts up in steps of 15 until it overflows, then starts over, so the screen indicator blinks while nothing is heard.",
    ]),
    '05300': ('R1: measure silence', [
        "Counts passes while the line is idle. When the tone starts, the count is saved in `TSP` and the loop moves on to measure the tone.",
    ]),
    '05490': ('R2: measure a tone', [
        "Counts passes while the tone is present. Whenever the polarity reads idle, it checks for 25 idle readings in a row (`TIME`) in a tight loop, `R50`, each reading about 25 cycles, so a window of about 0.7 ms. "
        "If a tone reading shows up inside the window the polarity is still flipping, so the tone continues and the count carries on. Only a still polarity for the whole window ends the tone. "
        "That is how short flips, the half-cycles of the tone and brief noise, are ignored, and how the end of a tone is noticed. For this to work a tone's half-cycle must be shorter than the window, so the pitch must be above about 700 Hz.",
        "Every time that window fails, the readings it used are added to the count, as well as the one pass of the slower loop. The length measured therefore is not a clean count of passes; it is inflated by an amount that depends on how the tone's flips line up with the loop's samples (about three times at 1200 Hz in the emulator). "
        "When the alignment is steady through a tone, the inflation is steady and dit and dah stay in proportion. At some pitches the alignment slides slowly against the loop and the lengths vary a lot from tone to tone. That is the preferred pitch effect: in the emulator a clean 1200, 1400 and 1800 Hz tone works, and 1300 Hz does not.",
    ]),
    '05770': ('End of a tone', [
        "The 25 readings used for the check were counted as passes, so they are subtracted. X is now the tone's length.",
    ]),
    '05780': ('Learning dit and dah', [
        "The first tone becomes `T1`. Then the loop goes back and measures a second, `T2`. If the two are equal, or less than half apart, it ignores the second and waits for another tone. "
        "Once they differ enough, it sorts them (short is a dit, long is a dah) and works out the thresholds below. It learns only once; a restart is needed to learn again.",
        "Because `T1` and `T2` are the first two tones heard, the first character of a message is used up by learning. Send a short character such as V first.",
    ]),
    '06170': ('R7: the thresholds', [
        "`TMID` is halfway between a dit and a dah. `TF` is half a dit, below which a tone is noise. `T3` is the longest tone allowed (a dah plus `TMID`). "
        "Anything longer sends the receiver back to the start.",
    ]),
    '06300': [
        ('TSP: when a letter ends', [
            "As printed, `TSP` comes from the idle gap just before the second calibration tone: four times that gap, or `TMID` if 3.5 times it is more than `TMID`. "
            "Later, `R14` counts three per pass starting at 25, so a letter ends after `(TSP - 25) / 3` passes of silence.",
            "That works for this program's own sending rhythm, where the gap inside a letter is about 0.43 of a dit. For ordinary Morse, where it is one dit, the threshold comes out below the "
            "gap inside a letter, so every element is printed as its own letter.",
        ], 'orig'),
        ('TSP: when a letter ends (patched)', [
            "`TSP` is now 2.25 times `TMID` plus 25. With the three-per-pass counting in `R14`, that ends a letter after 0.75 times `TMID` passes of silence, which is about 1.5 dits for a 1:3 dit/dah ratio. "
            "It sits between the gap inside a letter (0.43 dit for this program, 1 dit for ordinary Morse) and the gap between letters (2.2 dits, or 3).",
        ], 'patched'),
    ],
    '06650': ('The corner lights', [
        "The two cells at the top left of the screen, `$0400` and `$0401`, are set to `$9F` (yellow) and `$AF` (blue) in opposite order at the start of each tone here, and swapped back when it ends (`R45`). "
        "So from this point they flash as tones come and go. Nothing flashes in the corner while the receiver is still learning, so the first flash means the dit and dah lengths are known and it is decoding. "
        "The cell beside them, `$0405`, flips color after each finished letter, and `$0403` flips each time receiving restarts with nothing heard. The sender swaps the same two cells with every element it sends.",
    ]),
    '06450': ('Decoding', [
        "From here each element is measured and added to `RC`. `RC` starts as 1; a dit shifts it left, a dah shifts it left and adds one. That leaves the same format `TABLE` uses: a leading 1 followed by the elements.",
    ]),
    '06490': ('R11: wait for the next tone', [
        "Waits while the line is idle. At the first sign of a tone it moves on to measure it.",
    ]),
    '06710': ('R12: measure and classify', [
        "Counts the tone, with the same 25-reading check at the end as `R2`. A tone shorter than `TF` is ignored as noise. A tone longer than `TMID` is a dah, otherwise a dit. "
        "`MCT` stops a runaway at 8 elements.",
    ]),
    '07160': ('R14: the gap after an element', [
        "Counts three per pass, starting at `TIME`. If a tone comes back first, it is the next element. If the count reaches `TSP`, the letter is finished and `PUT` prints it.",
    ]),
    '07420': [
        ('TEMP: the word gap (as printed)', [
            "`TEMP` is set to two times `T3` plus `T2`, in loop passes. But the loop that uses it, `R18`, is a tight 30-cycle loop with no keyboard poll, while those counts came from loops of about 700 cycles. "
            "It times out in tens of milliseconds, less than the gap between letters, so a blank is printed after every letter.",
        ], 'orig'),
        ('TEMP: the word gap (patched)', [
            "`TEMP` is now 1.5 times `TMID`, and `R18` calls `UPSTK` on each pass like the other loops, so a pass means the same thing everywhere. A blank is printed after about 3 dits of silence on top of the letter gap: roughly 4.5 dits in total, "
            "between a letter gap (3) and a word gap (7).",
        ], 'patched'),
    ],
    '07570': ('PUT: show a character', [
        "Looks for `RC` in `TABLE`. The index it finds is the character's code, which it prints with `CHRCV`. A pattern it does not know restarts receiving.",
    ]),
    '07720': ('TABLE: the Morse code', [
        "One byte per character, indexed by the character's code masked to six bits, so `@` is entry 0, `A` is 1, and so on, then space, `!`, up through `?`. The byte is a leading 1 followed by the elements, 1 for a dah and 0 for a dit: "
        "`$05` is `101`, dit dah, A. Zero means the character has no Morse code. `@` is BT, `+` is KN, `<` is SK and `>` is AR.",
    ]),
    '08360': ('STACK', [
        "The send buffer starts here and grows upward. It is not a hardware stack.",
    ]),
}
