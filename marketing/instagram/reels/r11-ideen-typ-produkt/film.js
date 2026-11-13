// R11 · Der Ideen-Typ, Problem und Lösung: kurzer Sketch, dann zeigt die echte App, wie es einfacher geht.
import { storyFilm } from '../_shared/story.js';
import T from './timing.js';
const K = T.cards;

storyFilm({
  images: {
    entdecken: '../_shared/shots/demo_entdecken.png',
    frmich: '../_shared/shots/demo_frmich.png',
    nachrichten: '../_shared/shots/demo_nachrichten.png',
  },
  scenes: [
    { at: K[0], type: 'chat', items: [
      { at: K[0], text: 'Wir machen 50/50. Ich hab ja die Idee.', name: 'Max' },
      { at: K[1], text: 'Und wer baut die App?', right: true, name: 'Du' },
      { at: K[2], text: 'Du. Ist ja nur ein Wochenende.', name: 'Max' },
    ] },
    { at: K[3], type: 'text', fat: 'So verlierst', thin: 'du Monate.', size: 175 },
    { at: K[4], type: 'text', fat: 'Es geht', thin: 'einfacher.', size: 230 },
    { at: K[5], type: 'shot', img: 'entdecken', keys: [
      { at: K[5], cam: [1200, 830, 1560], cap: { fat: 'Sag, was', thin: 'du baust.' } },
      { at: K[6], cam: [702, 900, 600], cap: { fat: '94 % Passung.', thin: 'Mit Grund.' } },
      { at: K[7], cam: [1198, 1230, 560], cap: { fat: 'Zeit und Ziel.', thin: 'Vorher.' } },
    ] },
    { at: K[8], type: 'shot', img: 'frmich', keys: [
      { at: K[8], cam: [1200, 1150, 1500] },
      { at: K[8] + 1.2, cam: [1150, 1260, 900], cap: { fat: 'Passende Leute', thin: 'finden dich.' } },
    ] },
    { at: K[9], type: 'shot', img: 'nachrichten', keys: [
      { at: K[9], cam: [1540, 760, 1050], cap: { fat: 'Alles an', thin: 'einem Ort.' } },
      { at: K[9] + 4, cam: [2280, 1000, 760] },
    ] },
  ],
  end: { at: T.end, line: 'Kostenlos in der Beta. Bewerben über den Link im Profil.' },
});
