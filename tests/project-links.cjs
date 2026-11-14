// Projekt-Kurzlinks (xyntal.de/name-titel): Weiterleitung auf projekte.html und 404 für ungültige Namen.
// server.cjs exportiert nichts und startet beim Import Listener und Git-Abrufe. Deshalb werden die
// Routing-Zeilen aus dem Quelltext ausgeschnitten und unverändert in einem vm-Kontext ausgeführt.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../hosting/daki/server.cjs'), 'utf8');
const lines = source.split('\n');
const indexOf = (marker) => {
  const i = lines.findIndex((line) => line.includes(marker));
  assert.notEqual(i, -1, 'Zeile nicht gefunden: ' + marker);
  return i;
};
// Kartenregel (u.html, läuft vor den Projektlinks), Projektregel und der 404-Block danach
const cardLine = lines[indexOf("file = path.join(currentRoot, 'u.html')")];
const projectAt = indexOf('Längere Projekt-Kurzlinks');
const projectLine = lines[projectAt + 1];
const notFoundBlock = lines.slice(projectAt + 2, projectAt + 6).join('\n');
assert.match(projectLine, /file = path\.join\(currentRoot, 'projekte\.html'\);$/, 'Projektzeile geändert');
assert.match(notFoundBlock, /res\.writeHead\(404/, '404-Rückfall nach der Projektzeile fehlt');

const root = path.resolve(__dirname, '../public');
const projekte = path.join(root, 'projekte.html');
const cardPage = path.join(root, 'u.html');

// Führt die Routing-Zeilen für einen Pfad aus und liefert Zieldatei und Statuscode (null = keine Antwort)
const run = (pathname) => {
  const res = {
    status: null,
    location: null,
    writeHead(code, headers = {}) { this.status = code; this.location = headers.Location || null; },
    end() {},
  };
  const ctx = { fs, path, currentRoot: root, pathname, req: { method: 'GET' }, res, file: path.resolve(root, '.' + pathname) };
  // Als Funktion, weil der 404-Block wie im Server mit return endet
  vm.runInNewContext('(function () {\n' + cardLine + '\n' + projectLine + '\n' + notFoundBlock + '\n})();', ctx);
  return { file: ctx.file, status: res.status, location: res.location };
};
const goesToProjekte = (pathname) => {
  const r = run(pathname);
  return r.status === null && r.file === projekte;
};
const is404 = (pathname) => run(pathname).status === 404;

// 1. Gültige Projekt-Kurzlinks (mehr als 20 Zeichen vor dem ersten Bindestrich-Teil, nur [a-z0-9_-]) gehen auf projekte.html
const valid = [
  '/nachbar-app-berlin-2026',
  '/nachbar-app-berlin-2026/',
  '/ki-startup-fuer-handwerk-2026',
  '/a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p',
  '/ab_cd-ef_gh-ijklmnopqrstuvwxyz0123',
  '/' + 'x'.repeat(20) + '-' + 'y'.repeat(119),
];
for (const pathname of valid) {
  assert.ok(goesToProjekte(pathname), 'erwartet projekte.html: ' + pathname + ' ' + JSON.stringify(run(pathname)));
}

// 2. Kurze Namen (höchstens 20 Zeichen) gehören zur Kartenregel (u.html) und landen nicht auf projekte.html
assert.equal(run('/nachbar-app').file, cardPage);
assert.equal(run('/nachbar-app').status, null);

// 3. Ungültige Zeichen oder Formen führen zu 404, nie zu projekte.html
const invalid = [
  '/Nachbar-App-Berlin-2026', // Großbuchstaben
  '/nachbar.app-berlin-2026', // Punkt
  '/nachbar%20app-berlin-2026', // kodiertes Leerzeichen
  '/nachbar app-berlin-2026', // Leerzeichen
  '/nachbar-app-berlin-2026/extra', // weiterer Pfadteil
  '/nachbar-app-berlin-2026.html', // Dateiendung
  '/-nachbar-app-berlin-2026', // beginnt mit Bindestrich
  '/nachbar_app!berlin-2026', // Ausrufezeichen
  '/nachbar-app%3Cscript%3E', // kodierte Zeichen
  '/%2e%2e-etc-passwd-datei', // kodierte Punkte
  '/..-passwd-datei', // Punkte
  '/nachbar\\app-berlin-2026', // Backslash
  '/ä-berlin-2026-app-x', // Umlaut
];
for (const pathname of invalid) {
  assert.ok(!goesToProjekte(pathname), 'ungültiger Name führt zu projekte.html: ' + pathname);
}
// Ersten Teil über 20 Zeichen und zweiten Teil über 119 Zeichen weisen ebenfalls ab
assert.ok(is404('/' + 'x'.repeat(21) + '-berlin-2026'), 'erster Teil über 20 Zeichen');
assert.ok(is404('/nachbar-' + 'y'.repeat(120)), 'zweiter Teil über 119 Zeichen');
// Diese Pfade treffen keine der Regeln für Projekte und müssen als 404 enden
for (const pathname of ['/Nachbar-App-Berlin-2026', '/nachbar.app-berlin-2026', '/nachbar app-berlin-2026', '/nachbar-app-berlin-2026/extra', '/-nachbar-app-berlin-2026', '/nachbar\\app-berlin-2026', '/nachbar_app!berlin-2026']) {
  assert.ok(is404(pathname), 'erwartet 404: ' + pathname + ' ' + JSON.stringify(run(pathname)));
}

// 4. Fremde Ziele: die Weiterleitung zeigt nur auf das feste projekte.html im eigenen Ordner.
// Der Pfad fließt nie in das Ziel, und Traversal oder fremde Hosts treffen die Regel nicht.
for (const pathname of ['/../../etc/passwd-x', '//evil.example/nachbar-app-berlin-2026', '/http:--evil.example-berlin-2026', '/%2e%2e/geheim-datei-x']) {
  const r = run(pathname);
  assert.equal(r.location, null, 'keine externe Weiterleitung: ' + pathname);
  assert.ok(!goesToProjekte(pathname), 'fremder Pfad führt zu projekte.html: ' + pathname);
}
assert.equal(run('/nachbar-app-berlin-2026').file, projekte);

console.log('PASS: Projekt-Kurzlinks (projekte.html für gültige Namen, 404 für ungültige, feste Ziele)');
