// R01 · Tag 1 von 30 (Säule C, ohne Gesicht).
import { cardsFilm } from '../_shared/cards.js';
import T from './timing.js';
cardsFilm({
  header: 'Tag 1 / 30', progress: 1 / 30,
  cards: [
    { at: T.cards[0], label: 'Stand heute', fat: '0 Follower.', thin: 'Null.', size: 210 },
    { at: T.cards[1], label: 'Das Ziel', counter: { from: 0, to: 10000, dur: 3.5, sub: 'in 30 Tagen.' } },
    { at: T.cards[2], fat: 'Ohne Gesicht.', thin: 'Ohne\nWerbebudget.', size: 190 },
    { at: T.cards[3], fat: 'Nur Posts', thin: 'übers Gründen\nzu zweit.', size: 190 },
    { at: T.cards[4], label: 'Warum', fat: 'Ich baue Xyntal.', thin: 'Damit du\ndein Team\nfindest.', size: 170 },
    { at: T.cards[5], fat: 'Folg mit,', thin: 'ob es\nklappt.', size: 210 },
  ],
  end: { at: T.end, line: 'Jeden Tag ein Update. Morgen kommt Tag 2.' },
});
