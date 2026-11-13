// R04 · Vesting in 30 Sekunden (Säule D als Reel).
import { cardsFilm } from '../_shared/cards.js';
cardsFilm({
  header: 'Gründen zu zweit', seed: 3,
  cards: [
    { at: 0, label: 'Erklärt', fat: 'Vesting', thin: 'in 30\nSekunden.', size: 230 },
    { at: 5, fat: 'Ihr gründet.', thin: '50/50.', size: 210 },
    { at: 9, label: 'Nach 4 Monaten', fat: 'Tim steigt aus.', size: 190 },
    { at: 13.5, label: 'Ohne Vesting', fat: 'Tim behält', thin: '50 %.', size: 220 },
    { at: 18, fat: 'Du baust allein', thin: 'weiter.\nFür die\nHälfte.', size: 170 },
    { at: 23.5, label: 'Mit Vesting', fat: 'Anteile werden', thin: 'über Zeit\nverdient.', size: 170 },
    { at: 29, label: 'Üblich', counter: { from: 0, to: 4, dur: 1.5, suffix: ' Jahre', sub: 'mit 1 Jahr Cliff.' } },
    { at: 34, fat: 'Geht er vorher,', thin: 'bleibt fast\nnichts.', size: 170 },
    { at: 39, label: 'Kein Rechtsrat', fat: 'Regelt es', thin: 'vor dem\nNotar.', size: 200 },
  ],
  end: { at: 44, line: 'Schick das deinem Mitgründer. Mehr zum Gründen zu zweit auf @xyntal.' },
});
