// R02 · POV: Der Ideen-Typ hat dich gefunden (Säule B). Timing kommt aus der Sprachspur (timing.js, _shared/vo.py).
import { chatFilm } from '../_shared/chat.js';
import T from './timing.js';

chatFilm({
  intro: { until: T.until, items: [{ at: T.intro[0], bubble: 'Wir machen 50/50.', name: 'Max', size: 120, y: 40 }, { at: T.intro[1], fat: 'Er bringt', thin: 'die Idee.', size: 170, y: 440 }, { at: T.intro[2], fat: 'Du baust', thin: 'die App.', size: 170, y: 750 }, { at: T.intro[3], fat: 'Fair?', size: 240, y: 1030 }] },
  hook: { label: 'POV', fat: 'Der Ideen-Typ', thin: 'hat dich\ngefunden.', size: 150 },
  contact: 'Max · hat eine Idee',
  msgs: [
    [T.msgs[0], 'l', 'Hey, du bist doch Entwickler, oder?'],
    [T.msgs[1], 'r', 'Ja, wieso?'],
    [T.msgs[2], 'l', 'Ich hab DIE Idee. Uber, aber für Hundesitter.'],
    [T.msgs[3], 'r', 'Okay. Und was ist dein Part?'],
    [T.msgs[4], 'l', 'Na, die Idee.'],
    [T.msgs[5], 'l', 'Wir machen 50/50.'],
    [T.msgs[6], 'r', 'Und wer baut die App?'],
    [T.msgs[7], 'l', 'Du. Ist ja nur ein Wochenende Arbeit.'],
  ],
  punch: { at: T.punch, fat: 'Ideen hat\njeder.', thin: 'Mitbauer\nnicht.', size: 170 },
  end: { at: T.end, line: 'Fair oder nicht? Schreib es in die Kommentare.' },
});
