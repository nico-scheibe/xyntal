// R08 · POV: Einziger Dev auf dem Gründer-Event (Säule B).
import { chatFilm } from '../_shared/chat.js';
import T from './timing.js';
chatFilm({
  hook: { label: 'POV', fat: 'Gründer-Event.', thin: 'Du bist der\neinzige Dev.', size: 140 },
  contact: 'Nachrichten · nach dem Event',
  msgs: [
    [T.msgs[0], 'l', 'Hi! Wir hatten vorhin kurz gequatscht. Lust auf ein Fintech?'],
    [T.msgs[1], 'l', 'Hey, ich bin Tim. Ich bräuchte nur kurz eine App.'],
    [T.msgs[2], 'l', 'Du kannst doch bestimmt was mit KI?'],
    [T.msgs[3], 'l', 'Ist erst mal unbezahlt, aber mega Lernkurve!'],
    [T.msgs[4], 'l', 'Anteile gibt es auch. 2 %.'],
    [T.msgs[5], 'r', 'Ich war nur wegen der Pizza da.'],
  ],
  punch: { at: T.punch, fat: 'Devs sind\ngefragt.', thin: 'Sag, was\ndu willst.', size: 165 },
  end: { at: T.end, line: 'Auf Xyntal stehen die Bedingungen vorher fest: Anteile, Geld oder Nebenprojekt.' },
});
