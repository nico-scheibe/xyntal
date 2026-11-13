// R02 · POV: Der Ideen-Typ hat dich gefunden (Säule B). Text und Timing in Beats.
import { chatFilm } from '../_shared/chat.js';

chatFilm({
  hook: { label: 'POV', fat: 'Der Ideen-Typ', thin: 'hat dich\ngefunden.', size: 150 },
  contact: 'Max · hat eine Idee',
  msgs: [
    [1.5, 'l', 'Hey, du bist doch Entwickler, oder?'],
    [4.5, 'r', 'Ja, wieso?'],
    [7.5, 'l', 'Ich hab DIE Idee. Uber, aber für Hundesitter.'],
    [11, 'r', 'Okay. Und was ist dein Part?'],
    [14, 'l', 'Na, die Idee.'],
    [16.5, 'l', 'Wir machen 50/50.'],
    [19.5, 'r', 'Und wer baut die App?'],
    [22.5, 'l', 'Du. Ist ja nur ein Wochenende Arbeit.'],
  ],
  punch: { at: 26.5, fat: 'Ideen hat\njeder.', thin: 'Mitbauer\nnicht.', size: 170 },
  end: { at: 31, line: 'Hier findest du Leute, die mitbauen. Nicht nur mitreden.' },
});
