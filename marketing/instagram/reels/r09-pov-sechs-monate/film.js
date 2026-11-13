// R09 · POV: Erstes Meeting vs. sechs Monate später (Säule B).
import { chatFilm } from '../_shared/chat.js';
import T from './timing.js';
chatFilm({
  hook: { label: 'POV', fat: 'Erstes Meeting', thin: 'vs. sechs\nMonate später.', size: 140 },
  contact: 'Mia · Mitgründerin',
  msgs: [
    [T.msgs[0], 'l', 'Ich hab so ein gutes Gefühl bei uns!'],
    [T.msgs[1], 'r', 'Ich auch. Wir machen alles zusammen.'],
    [T.msgs[2], 'l', 'Entscheidungen immer gemeinsam, ja?'],
    [T.msgs[3], 'r', 'Klar!'],
    [T.msgs[4], 'd', 'Sechs Monate später'],
    [T.msgs[5], 'l', 'Ich hab das Logo geändert.'],
    [T.msgs[6], 'r', 'Ohne mich zu fragen?'],
    [T.msgs[7], 'l', 'Wir hatten nie gesagt, wer was entscheidet.'],
    [T.msgs[8], 'r', '…'],
  ],
  punch: { at: T.punch, fat: 'Gute Gefühle', thin: 'ersetzen\nkeine Regeln.', size: 135 },
  end: { at: T.end, line: 'Klärt vorher, wer was entscheidet. Mehr zum Gründen zu zweit auf @xyntal.' },
});
