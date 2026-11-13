// R05 · POV: Dein Mitgründer, drei Wochen später (Säule B).
import { chatFilm } from '../_shared/chat.js';
chatFilm({
  hook: { label: 'POV', fat: 'Dein Mitgründer,', thin: 'drei Wochen\nspäter.', size: 132 },
  contact: 'Lukas · Mitgründer',
  msgs: [
    [1.5, 'l', 'Ich bin all in. Ab jetzt jeden Abend!'],
    [4.5, 'r', 'Mega. Morgen 19 Uhr Call?'],
    [7, 'l', 'Bin dabei!'],
    [9.5, 'd', 'Drei Wochen später'],
    [11.5, 'r', 'Call heute?'],
    [14, 'l', 'Diese Woche ist echt viel los.'],
    [16.5, 'r', 'Nächste Woche?'],
    [19, 'l', 'Muss erst mal schauen.'],
    [22, 'l', 'Bin gerade eher so bei 2 Stunden pro Woche.'],
  ],
  punch: { at: 26, fat: 'Klärt die Zeit,', thin: 'bevor ihr\nanfangt.', size: 165 },
  end: { at: 31, line: 'Auf Xyntal steht bei jedem Projekt, wie viele Stunden pro Woche drin sind.' },
});
