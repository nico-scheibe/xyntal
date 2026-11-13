// R03 · POV: Du bist Designerin, der Dev meldet sich (Säule B).
import { chatFilm } from '../_shared/chat.js';
import T from './timing.js';
chatFilm({
  hook: { label: 'POV', fat: 'Du bist Designerin.', thin: 'Der Dev\nmeldet sich.', size: 132 },
  contact: 'Jonas · Backend-Dev',
  msgs: [
    [T.msgs[0], 'l', 'Kannst du mal schnell ein Logo machen?'],
    [T.msgs[1], 'r', 'Klar. Für was genau?'],
    [T.msgs[2], 'l', 'Für die App. Irgendwas Modernes.'],
    [T.msgs[3], 'r', 'Wer ist die Zielgruppe?'],
    [T.msgs[4], 'l', 'Alle.'],
    [T.msgs[5], 'r', 'Farben? Stil? Beispiele?'],
    [T.msgs[6], 'l', 'Mach einfach. Du bist ja kreativ.'],
    [T.msgs[7], 'l', 'Bis morgen früh? Pitch ist um 9.'],
  ],
  punch: { at: T.punch, fat: 'Design ist\nkein Extra.', thin: 'Es ist\nein Job.', size: 165 },
  end: { at: T.end, line: 'Hier findest du Designer:innen, die von Anfang an mitbauen.' },
});
