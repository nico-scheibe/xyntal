// R01 · Tag 1 von 30 (Säule C, ohne Gesicht).
import { cardsFilm } from '../_shared/cards.js';
cardsFilm({
  header: 'Tag 1 / 30', progress: 1 / 30,
  cards: [
    { at: 0, label: 'Stand heute', fat: '0 Follower.', thin: 'Null.', size: 210 },
    { at: 5, label: 'Das Ziel', counter: { from: 0, to: 10000, dur: 3.5, sub: 'in 30 Tagen.' } },
    { at: 12, fat: 'Ohne Gesicht.', thin: 'Ohne\nWerbebudget.', size: 190 },
    { at: 17, fat: 'Nur Posts', thin: 'übers Gründen\nzu zweit.', size: 190 },
    { at: 22, label: 'Warum', fat: 'Ich baue Xyntal.', thin: 'Damit du\ndein Team\nfindest.', size: 170 },
    { at: 28, fat: 'Folg mit,', thin: 'ob es\nklappt.', size: 210 },
  ],
  end: { at: 33, line: 'Jeden Tag ein Update. Morgen kommt Tag 2.' },
});
