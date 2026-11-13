// R05 · POV: Dein Mitgründer, drei Wochen später (Säule B).
import { chatFilm } from '../_shared/chat.js';
import T from './timing.js';
chatFilm({
  hook: { label: 'POV', fat: 'Dein Mitgründer,', thin: 'drei Wochen\nspäter.', size: 132 },
  contact: 'Lukas · Mitgründer',
  msgs: [
    [T.msgs[0], 'l', 'Ich bin all in. Ab jetzt jeden Abend!'],
    [T.msgs[1], 'r', 'Mega. Morgen 19 Uhr Call?'],
    [T.msgs[2], 'l', 'Bin dabei!'],
    [T.msgs[3], 'd', 'Drei Wochen später'],
    [T.msgs[4], 'r', 'Call heute?'],
    [T.msgs[5], 'l', 'Diese Woche ist echt viel los.'],
    [T.msgs[6], 'r', 'Nächste Woche?'],
    [T.msgs[7], 'l', 'Muss erst mal schauen.'],
    [T.msgs[8], 'l', 'Bin gerade eher so bei 2 Stunden pro Woche.'],
  ],
  punch: { at: T.punch, fat: 'Klärt die Zeit,', thin: 'bevor ihr\nanfangt.', size: 165 },
  end: { at: T.end, line: 'Auf Xyntal steht bei jedem Projekt, wie viele Stunden pro Woche drin sind.' },
});
