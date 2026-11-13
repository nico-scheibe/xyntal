// R02 · POV: Der Ideen-Typ hat dich gefunden (Säule B). Timing kommt aus der Sprachspur (timing.js, _shared/vo.py).
import { chatFilm } from '../_shared/chat.js';
import T from './timing.js';

chatFilm({
  intro: { until: T.until, items: [{ at: T.intro[0], fat: 'Er:', thin: 'die Idee.', size: 200, y: 160 }, { at: T.intro[1], fat: 'Du:', thin: 'die App.', size: 200, y: 540 }, { at: T.intro[2], fat: 'Er:', thin: '50 %.', size: 200, y: 920 }] },
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
  end: { at: T.end, line: 'Hier findest du Leute, die mitbauen. Nicht nur mitreden.' },
});
