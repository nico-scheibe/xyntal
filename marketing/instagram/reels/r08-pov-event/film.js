// R08 · POV: Einziger Dev auf dem Gründer-Event (Säule B).
import { chatFilm } from '../_shared/chat.js';
chatFilm({
  hook: { label: 'POV', fat: 'Gründer-Event.', thin: 'Du bist der\neinzige Dev.', size: 140 },
  contact: 'Nachrichten · nach dem Event',
  msgs: [
    [1.5, 'l', 'Hi! Wir hatten vorhin kurz gequatscht. Lust auf ein Fintech?'],
    [4.5, 'l', 'Hey, ich bin Tim. Ich bräuchte nur kurz eine App.'],
    [7.5, 'l', 'Du kannst doch bestimmt was mit KI?'],
    [10.5, 'l', 'Ist erst mal unbezahlt, aber mega Lernkurve!'],
    [13.5, 'l', 'Anteile gibt es auch. 2 %.'],
    [17, 'r', 'Ich war nur wegen der Pizza da.'],
  ],
  punch: { at: 20.5, fat: 'Devs sind\ngefragt.', thin: 'Sag, was\ndu willst.', size: 165 },
  end: { at: 25.5, line: 'Auf Xyntal stehen die Bedingungen vorher fest: Anteile, Geld oder Nebenprojekt.' },
});
