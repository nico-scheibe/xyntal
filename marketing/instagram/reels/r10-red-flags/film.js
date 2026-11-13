// R10 · 5 Red Flags beim Mitgründer (Säule D als Reel).
import { cardsFilm } from '../_shared/cards.js';
cardsFilm({
  header: 'Gründen zu zweit', seed: 6,
  cards: [
    { at: 0, label: 'Mitgründer-Suche', fat: '5 Red Flags', thin: 'beim\nMitgründer.', size: 230 },
    { at: 5, label: 'Red Flag 1', fat: '„Ich hab die Idee,', thin: 'du machst\nden Rest.“', size: 170 },
    { at: 10, label: 'Red Flag 2', fat: 'Keine Zahl', thin: 'bei Stunden\npro Woche.', size: 200 },
    { at: 15, label: 'Red Flag 3', fat: 'Will keinen', thin: 'Vertrag.', sub: '„Wir sind doch Freunde.“', size: 210 },
    { at: 20, label: 'Red Flag 4', fat: 'Hat noch nie', thin: 'etwas zu\nEnde gebaut.', size: 190 },
    { at: 25, label: 'Red Flag 5', fat: 'Redet nur', thin: 'über Exit\nund Geld.', size: 210 },
    { at: 30, fat: 'Eine davon?', thin: 'Sprecht\ndarüber.', size: 210 },
  ],
  end: { at: 35, line: 'Schick das jemandem, der gerade einen Mitgründer sucht.' },
});
