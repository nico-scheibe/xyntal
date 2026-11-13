// R04 · Vesting in 30 Sekunden (Säule D als Reel).
import { cardsFilm } from '../_shared/cards.js';
import T from './timing.js';
cardsFilm({
  header: 'Gründen zu zweit', seed: 3,
  cards: [
    { at: T.cards[0], label: 'Erklärt', fat: 'Vesting', thin: 'in 30\nSekunden.', size: 230 },
    { at: T.cards[1], fat: 'Ihr gründet.', thin: '50/50.', size: 210 },
    { at: T.cards[2], label: 'Nach 4 Monaten', fat: 'Tim steigt aus.', size: 190 },
    { at: T.cards[3], label: 'Ohne Vesting', fat: 'Tim behält', thin: '50 %.', size: 220 },
    { at: T.cards[4], fat: 'Du baust allein', thin: 'weiter.\nFür die\nHälfte.', size: 170 },
    { at: T.cards[5], label: 'Mit Vesting', fat: 'Anteile werden', thin: 'über Zeit\nverdient.', size: 170 },
    { at: T.cards[6], label: 'Üblich', counter: { from: 0, to: 4, dur: 1.5, suffix: ' Jahre', sub: 'mit 1 Jahr Cliff.' } },
    { at: T.cards[7], fat: 'Geht er vorher,', thin: 'bleibt fast\nnichts.', size: 170 },
    { at: T.cards[8], label: 'Kein Rechtsrat', fat: 'Regelt es', thin: 'vor dem\nNotar.', size: 200 },
  ],
  end: { at: T.end, line: 'Schick das deinem Mitgründer. Mehr zum Gründen zu zweit auf @xyntal.' },
});
