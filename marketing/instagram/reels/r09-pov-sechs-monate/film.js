// R09 · POV: Erstes Meeting vs. sechs Monate später (Säule B).
import { chatFilm } from '../_shared/chat.js';
chatFilm({
  hook: { label: 'POV', fat: 'Erstes Meeting', thin: 'vs. sechs\nMonate später.', size: 140 },
  contact: 'Mia · Mitgründerin',
  msgs: [
    [1.5, 'l', 'Ich hab so ein gutes Gefühl bei uns!'],
    [4, 'r', 'Ich auch. Wir machen alles zusammen.'],
    [6.5, 'l', 'Entscheidungen immer gemeinsam, ja?'],
    [9, 'r', 'Klar!'],
    [11, 'd', 'Sechs Monate später'],
    [13, 'l', 'Ich hab das Logo geändert.'],
    [15.5, 'r', 'Ohne mich zu fragen?'],
    [18, 'l', 'Wir hatten nie gesagt, wer was entscheidet.'],
    [20.5, 'r', '…'],
  ],
  punch: { at: 24, fat: 'Gute Gefühle', thin: 'ersetzen\nkeine Regeln.', size: 135 },
  end: { at: 29, line: 'Klärt vorher, wer was entscheidet. Mehr zum Gründen zu zweit auf @xyntal.' },
});
