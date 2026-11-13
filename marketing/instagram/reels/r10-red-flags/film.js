// R10 · 5 Red Flags beim Mitgründer (Säule D als Reel).
import { cardsFilm } from '../_shared/cards.js';
import T from './timing.js';
cardsFilm({
  header: 'Gründen zu zweit', seed: 6,
  cards: [
    { at: T.cards[0], label: 'Mitgründer-Suche', fat: '5 Red Flags', thin: 'beim\nMitgründer.', size: 230 },
    { at: T.cards[1], label: 'Red Flag 1', fat: '„Ich hab die Idee,', thin: 'du machst\nden Rest.“', size: 170 },
    { at: T.cards[2], label: 'Red Flag 2', fat: 'Keine Zahl', thin: 'bei Stunden\npro Woche.', size: 200 },
    { at: T.cards[3], label: 'Red Flag 3', fat: 'Will keinen', thin: 'Vertrag.', sub: '„Wir sind doch Freunde.“', size: 210 },
    { at: T.cards[4], label: 'Red Flag 4', fat: 'Hat noch nie', thin: 'etwas zu\nEnde gebaut.', size: 190 },
    { at: T.cards[5], label: 'Red Flag 5', fat: 'Redet nur', thin: 'über Exit\nund Geld.', size: 210 },
    { at: T.cards[6], fat: 'Eine davon?', thin: 'Sprecht\ndarüber.', size: 210 },
  ],
  end: { at: T.end, line: 'Schick das jemandem, der gerade einen Mitgründer sucht.' },
});
