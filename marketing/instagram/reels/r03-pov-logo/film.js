// R03 · POV: Du bist Designerin, der Dev meldet sich (Säule B).
import { chatFilm } from '../_shared/chat.js';
chatFilm({
  hook: { label: 'POV', fat: 'Du bist Designerin.', thin: 'Der Dev\nmeldet sich.', size: 132 },
  contact: 'Jonas · Backend-Dev',
  msgs: [
    [1.5, 'l', 'Kannst du mal schnell ein Logo machen?'],
    [4.5, 'r', 'Klar. Für was genau?'],
    [7, 'l', 'Für die App. Irgendwas Modernes.'],
    [10, 'r', 'Wer ist die Zielgruppe?'],
    [12.5, 'l', 'Alle.'],
    [15, 'r', 'Farben? Stil? Beispiele?'],
    [17.5, 'l', 'Mach einfach. Du bist ja kreativ.'],
    [21, 'l', 'Bis morgen früh? Pitch ist um 9.'],
  ],
  punch: { at: 25, fat: 'Design ist\nkein Extra.', thin: 'Es ist\nein Job.', size: 165 },
  end: { at: 30, line: 'Hier findest du Designer:innen, die von Anfang an mitbauen.' },
});
