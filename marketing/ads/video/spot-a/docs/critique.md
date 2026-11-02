## Round 1
| hook | read | motion | variety | brand | sync | min |
|  6   |  5   |   6    |    7    |   8   |  -   |  5  |

Worst three (most damaging first):
1. [beats 0-16, 9x16] Wheel is small and sits in the top third; subtitles (29 px) unreadable on the phone sheet, bottom half of the frame empty -> hook feels thin -> cards 860x200, name 58, sub 34, spread the wheel over the safe height, centre at 55 %.
2. [beat 27] End-card downbeat frame is blank: panel has already closed and the mark hasn't sprung yet -> the hit lands on nothing -> start the mark spring at 26.6, close the panel 26.2-26.7, header exits 26.3-26.7; impact stays at 27 with the mark already on screen.
3. [beats 17-18] Panel open but empty for ~1 s before the prompt types -> dead time right after the lock -> prompt pill at 17.0, Lukas at 18.5, Ana 19, reasons 20.5/21.5/22.5; panel height 1040 so the payoff sits near its bottom edge.

Checks failed: blank frame on a cut (beat 27); readability (wheel subtitles).
Verdict: ANOTHER ROUND

## Round 2
| hook | read | motion | variety | brand | sync | min |
|  7   |  8   |   7    |    7    |   8   |  9   |  7  |

Worst three (most damaging first):
1. [beats 0-16] Wheel shows only ~3 cards in the top 40 % of the frame; the lower half is empty for 7.7 s -> the hook looks sparse on a phone -> spread the wheel over the full safe height (±600 px), keep 5 cards visible with a softer alpha falloff, cards 900x210.
2. [12.7-13.1 s] Panel ghost fades out while the mark is still tiny: a near-blank frame around the end-card cut -> move the mark spring to 26.3, close the panel 26.0-26.5, header exit 26.1-26.5, impact at 26.5 so the hit lands with the mark already big.
3. [beats 16.5-17.5] Panel opens as an empty box for ~0.5 s -> dead air after the lock -> open with the snappy spring and start the prompt at 16.7.

Checks failed: near-blank frame on the end-card cut.
Verdict: ANOTHER ROUND

## Round 3
| hook | read | motion | variety | brand | sync | min |
|  7   |  8   |   8    |    8    |   9   |  8   |  7  |

Worst three (most damaging first):
1. [beats 0-16] The wheel is linear, not circular: at frame 0 nothing sits above "Projekte" and at the lock nothing sits below "Passung", so the lower half of the frame stays empty -> wrap the index (mod 8) so five cards are always on screen and the wheel fills the safe height.
2. [beats 16.5-17] Whoosh and typing sit off the grid (±120 ms from an onset) -> whoosh peaks at 16.75, typing starts at 17.
3. [beat 24.25] Second chime note between beats -> move to 24.5 (eighth), still reads as a two-note chime.

Checks failed: none structural; sync 16/20 inside 20 ms before the fix.
Verdict: ANOTHER ROUND

## Round 4
| hook | read | motion | variety | brand | sync | min |
|  8   |  8   |   8    |    8    |   9   |  8   |  8  |

Worst three (most damaging first):
1. [beats 0-16] Seven cards visible at once is dense; the focus card still reads first thanks to the glow, so it stays. Could drop to five by fading |p| > 2 harder.
2. [beats 17-18] Panel is mostly empty while the prompt types for ~0.7 s; acceptable as a typing beat.
3. [beat 27] "logo" bell lands in the quiet end section, so onset detection finds no music onset to match; the bell itself is on the beat.

Checks failed: none. 17/20 hits within 20 ms, median 2.8 ms.
Verdict: READY

## Round 4
| hook | read | motion | variety | brand | sync | min |
|  8   |  8   |   8    |    8    |   9   |  8   |  8  |

Worst three (most damaging first):
1. [beats 0-16] Seven cards visible is dense; the focus card still reads first thanks to the glow. Could fade |p| > 2 harder.
2. [beats 17-18] Panel is mostly empty while the prompt types for ~0.7 s; acceptable as a typing beat.
3. [beat 27] "logo" bell lands in the quiet end section, so onset detection has no music onset to match; the bell is on the beat.

Checks failed: none. 17/20 hits within 20 ms, median 2.8 ms.
Verdict: READY

## Round 5 (v2 "spannender")
| hook | read | motion | variety | brand | sync | min |
|  9   |  8   |   9    |    9    |   9   |  9   |  8  |

Changes: two-turn ratcheting wheel with star streaks, music drop moved onto the lock (beat 16),
camera push + punches + shakes, live 0→99 ring count with shockwave, stakkato reasons, header
slams in word by word, flashes on lock and end card (the two structural moments).
Worst three:
1. [beat 16] Flash at 0.55 whites the lock frame out -> reduced to 0.4 so the Passung card stays visible under it.
2. [beats 16.2-16.6] Empty panel for ~0.2 s while it opens; acceptable, typing starts right after.
3. [beat 0] Frame 0 shows only "POV: Du" of the header; the wheel is already spinning so the frame is not blank.
Checks failed: none. 29/33 hits within 20 ms, median 3.4 ms.
Verdict: READY
