# Umzug auf xyntal.de

Stand: 22.10.2026. Die Domains liegen bei IONOS (Nameserver `ui-dns.*`).
`xyntal.de` zeigt derzeit auf die IONOS-Parkseite (`217.160.0.168`). Für die Domain gibt es bereits
E-Mail-Einträge bei IONOS (MX `mx00/mx01.ionos.de`, SPF `include:_spf-eu.ionos.com`) – **diese bleiben unverändert**.

Im Code ist alles vorbereitet (`public/CNAME`, Adressen in allen Seiten, Vorschaubild), aber noch **nicht
veröffentlicht**: Sobald `CNAME` auf GitHub liegt, leitet `nico-scheibe.github.io/xyntal/` auf xyntal.de um.
Darum erst die DNS-Einträge setzen, dann veröffentlichen.

## 1. IONOS – DNS für xyntal.de

Unter *Domains & SSL → xyntal.de → DNS*:

| Typ | Host | Wert |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | nico-scheibe.github.io |

- Den bisherigen A-Eintrag auf `217.160.0.168` (IONOS-Parkseite) und vorhandene AAAA-Einträge von IONOS für `@` entfernen.
- MX- und TXT/SPF-Einträge **nicht** anfassen.
- Falls IONOS „Domain mit Website verbinden“ oder eine Weiterleitung für xyntal.de aktiv hat: ausschalten,
  sonst greifen die eigenen Einträge nicht.

## 2. IONOS – Weiterleitungen

xyntal.com, xyntal.info und xyntal.store jeweils als **HTTP-Weiterleitung, dauerhaft (301)** auf
`https://xyntal.de` einrichten (mit und ohne `www`). Kein Frame-/Maskierungs-Redirect.

## 3. Veröffentlichen (mache ich)

Sobald `dig +short A xyntal.de` die vier GitHub-Adressen zeigt:
`git push` und `git subtree push --prefix public origin gh-pages`. Damit kommt `CNAME` auf GitHub.

## 4. GitHub

1. Repository → *Settings → Pages*: unter *Custom domain* steht `xyntal.de` (kommt aus der CNAME-Datei).
   Warten, bis der DNS-Check grün ist, dann **Enforce HTTPS** einschalten (das Zertifikat kann bis zu
   einer Stunde dauern).
2. Empfohlen gegen Übernahme der Domain durch Fremde: *Profil → Settings → Pages → Add a domain* →
   `xyntal.de` verifizieren. GitHub zeigt dazu einen TXT-Eintrag (`_github-pages-challenge-nico-scheibe`),
   der bei IONOS zusätzlich angelegt wird.

## 5. Supabase

*Authentication → URL Configuration*:
- **Site URL:** `https://xyntal.de/`
- **Redirect URLs:** `https://xyntal.de/**`, `https://www.xyntal.de/**`, `http://localhost:4173/**`
  (die alte `https://nico-scheibe.github.io/xyntal/**` noch ein paar Wochen stehen lassen, bis alte
  Bestätigungslinks abgelaufen sind)

Für Google-, Apple- und LinkedIn-Login ändert sich nichts: deren Rückleitung läuft über die Supabase-Adresse.

## 6. Brevo

- Wartelisten-Formular: im Einwilligungstext den Datenschutz-Link auf
  `https://xyntal.de/impressum#datenschutz` ändern.
- Eigene Absenderdomain (empfohlen, damit Mails seltener im Spam landen): *Senders, Domains & Dedicated IPs →
  Domains → Add a domain* → `xyntal.de`. Brevo zeigt die genauen DNS-Einträge (DKIM, Brevo-Code, DMARC);
  diese bei IONOS anlegen.
  - **Wichtig:** Es darf nur **einen** SPF-Eintrag geben. Statt einen zweiten anzulegen, den bestehenden
    erweitern, z. B. `v=spf1 include:_spf-eu.ionos.com include:spf.brevo.com ~all` – den genauen
    Brevo-Teil aus der Brevo-Anzeige übernehmen.
  - DMARC zum Start beobachtend: TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:DEINE-ADRESSE@xyntal.de`
- Danach Absender in Brevo und im Supabase-SMTP (Authentication → Emails → SMTP Settings) auf eine
  Adresse `@xyntal.de` umstellen, z. B. `hallo@xyntal.de` (Postfach bzw. Weiterleitung bei IONOS anlegen).

## 7. Prüfen

- https://xyntal.de und https://www.xyntal.de laden die Seite mit gültigem Zertifikat
- https://nico-scheibe.github.io/xyntal/ leitet auf https://xyntal.de/ um
- xyntal.com/.info/.store leiten auf https://xyntal.de um
- Registrierung, Bestätigungsmail und Passwort-Reset führen auf xyntal.de zurück
- Vorschau beim Teilen (z. B. in WhatsApp) zeigt das Bild mit „xyntal.de“
