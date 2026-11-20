# Critique log

## Round 1 (contact every 2 beats, phone sheets, strips hook/reveal/appin/why, sync.py)
Scores: hook 7 · readability at phone size 6 · motion 7 · variety 8 · brand accuracy 8 · sound sync 7
Worst three:
1. The friends never leave in the night street (S5): "Alle sind unterwegs" had no picture. -> five grey figures hop out of frame from the door on "Alle", FREITAG · 22:47 tag swings in.
2. Leipzig/Graz tags tiny (36 px mono) and clipped at the left edge; the two lights not marked. -> label cards 64/38 px clamped to the safe area, ring around each light, thread to the card.
3. The question bubble overflowed ("machst du" cut). -> 41 px, wider bubble.
Also: hook dolly (start at 1.32 on the lit figure, pull back to the crowd), calmer city outlines, moon moved off the plan, my window fades into the X, end URL 32 px.

## Round 2 (strips hook/reveal/appin/why)
Scores: hook 7 · readability 7 · motion 8 · variety 8 · brand 8 · sync 7
Worst three:
1. The particle X is small (≈290 px wide) for the brand moment. -> X scale 1100, 2400 particles.
2. "Und warum" cards sit in the top half with empty frame below. -> three tight crops (ring + title, Ergänzung, Vision 20/20) centred on the frame.
3. Hook holds 3 s with only the dolly. -> the crowd ripples (small hop, outward from you) on "Umfeld"; bigger spark.

## Round 3 (full per-beat contact, phone sheets)
Scores: hook 8 · readability 8 · motion 8 · variety 8 · brand 9 · sync 8
Worst three:
1. The "?" sat on the silhouette's head inside the window. -> moved above the window, off-white, a slow sway.
2. The dotted thread from the window to the (already dead) plan crossed the roof during the push-in. -> fades with the first node (43.4-43.9).
3. S8 holds 2.5 s on a tiny window: kept on purpose (the silence before "Aber hier ist der Punkt"), the voice carries it.
Remaining (not blocking): network lines leave the frame at the edges; UI text in the app shots is small at phone size (headline, names, 89 % read; body copy doesn't).

## Round 4 – English, international version (contact every 2 beats, strips globe-in / heroes / reveal / end line)
Voice: ElevenLabs v3 with audio tags, library voice "Dahlia", read tightened 1.1x. Act I and the city run on a time warp
(film.js WARP) from the earlier read; the globe, app and end card are timed on this read directly.
Scores: hook 8 · readability 8 · motion 8 · variety 9 · brand 9 · sync 8
Worst three, fixed:
1. Blank frame between the network and the X: the particles were drawn inside the globe's early return. -> globe body and particles split.
2. "building alone." overflowed and read grey: fitSize got a pixel tracking. -> fit to 860 px, weight 300.
3. Dim gap in the city -> globe handover. -> globe fades in from 68.3, city out from 69.0.

## Round 5 – the crowd (stills at 81.5 / 85.5 s, strip 79.6-85.5 s)
Asked for: many users at the end, not two. Built as an illustration (hundreds of person symbols in rows of depth,
each with a spark, links in the gradient on "alone"), not as a product screen: no names, no member count.
Worst three, fixed:
1. Tagline and URL sat on top of the crowd. -> the crowd sinks 560 px and dims under the end card.
2. Links between neighbours nearly invisible. -> 0.85 alpha, 1.5-4 px, ~60 % of neighbours linked.
3. Crowd entrance had no sound. -> swell + four pops on the wave.

## Round 6 – logo animation (strips 71.6-73.6 s, 81.7-83.8 s)
Feedback: the logo animation looked flat (strokes simply drawing on).
- Particle X now snaps into the solid mark (flash, slight settle, light band across it); the wordmark tracks in.
- End card: light streaks rise from the crowd, stroke B and stroke A slash in with lit tips, the hit lands with a
  flash, a jolt and a gradient ring that lights the crowd as it passes, then a sheen; wordmark tracks in.
Scores: hook 8 · readability 8 · motion 9 · variety 9 · brand 9 · sync 8

## Round 7 – one logo only (strip 68.8-74.6 s, stills 72 / 84 s)
Feedback: the first Xyntal logo (particle X) should go; the logo belongs on the end card only.
- "Meet Xyntal. The place that connects ambitious people." now stays on the globe: the network builds in the
  gradient, light packets run both ways along every arc, each light gets a gradient ring, the camera turns and
  pushes in, and the app window rises out of it. Particle-X code removed.
