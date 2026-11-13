// R06 · Hook-Variante zu Tag 1: andere erste Karte, gleicher Rest (Trial Reel).
import { cardsFilm } from '../_shared/cards.js';
import T from './timing.js';
cardsFilm({
  header: 'Tag 1 / 30', progress: 1 / 30, seed: 5,
  cards: [
    { at: T.cards[0], label: 'Experiment', fat: '30 Tage.', thin: '10.000\nFollower?', size: 210 },
    { at: T.cards[1], label: 'Start', counter: { from: 0, to: 0, dur: 0.5, sub: 'Follower. Wirklich null.' } },
    { at: T.cards[2], fat: 'Kein Gesicht.', thin: 'Kein\nWerbebudget.', size: 190 },
    { at: T.cards[3], label: 'Nur', fat: 'Gute Posts', thin: 'übers Gründen\nzu zweit.', size: 190 },
    { at: T.cards[4], fat: 'Klappt das?', thin: 'Folg mit\nund sieh\nzu.', size: 200 },
  ],
  end: { at: T.end, line: 'Jeden Tag ein Update. Morgen kommt Tag 2.' },
});
