// R06 · Hook-Variante zu Tag 1: andere erste Karte, gleicher Rest (Trial Reel).
import { cardsFilm } from '../_shared/cards.js';
cardsFilm({
  header: 'Tag 1 / 30', progress: 1 / 30, seed: 5,
  cards: [
    { at: 0, label: 'Experiment', fat: '30 Tage.', thin: '10.000\nFollower?', size: 210 },
    { at: 5, label: 'Start', counter: { from: 0, to: 0, dur: 0.5, sub: 'Follower. Wirklich null.' } },
    { at: 10, fat: 'Kein Gesicht.', thin: 'Kein\nWerbebudget.', size: 190 },
    { at: 15, label: 'Nur', fat: 'Gute Posts', thin: 'übers Gründen\nzu zweit.', size: 190 },
    { at: 21, fat: 'Klappt das?', thin: 'Folg mit\nund sieh\nzu.', size: 200 },
  ],
  end: { at: 27, line: 'Jeden Tag ein Update. Morgen kommt Tag 2.' },
});
