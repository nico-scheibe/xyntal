# Abo-Kauf in der iPhone-App (Apple In-App-Kauf)

Diese Datei beschreibt, was im Code passiert und was nur in App Store Connect
eingerichtet werden kann. Stand 2026-11-14.

## Warum nicht Stripe wie im Web

App-Store-Regel **3.1.1** verlangt für Abos, die Funktionen in der App freischalten,
ausdrücklich den In-App-Kauf. **3.1.1(a)** verbietet außerhalb des US-Storefronts jeden
Button, Link oder Aufruf zu einem anderen Kaufweg, solange kein
*StoreKit External Purchase Link Entitlement* vorliegt. **3.1.3(b)** erlaubt es, ein auf
der Website gekauftes Abo in der App zu nutzen – aber nur, wenn derselbe Tarif in der App
auch als In-App-Kauf angeboten wird.

Deshalb:
- Gekauft wird über StoreKit 2, nicht über Stripe.
- **Plus, Pro und Ultra** sind als Apple-Produkte dabei. Ultra ist auf dem Handy wenig
  sinnvoll, muss aber dabei sein, weil die App Ultra-Konten anerkennt (3.1.3(b)).
- **Business, Enterprise, Enterprise+** bleiben draußen: Firmenverträge mit Erklärung nach
  § 14 BGB, Quartalsabrechnung, Rechnung auf die Firma. Die App zeigt sie nicht an.
- In der App steht **kein** Preisvergleich mit dem Web und **kein** Link auf einen
  Kaufweg. Der frühere Link auf `xyntal.de/tarif` ist aus dem Kauf-Fall entfernt.

## Produkte (Abo-Gruppe „Xyntal“, drei Stufen)

| Tarif | monatlich                 | jährlich                 | Stufe |
|-------|---------------------------|--------------------------|-------|
| Plus  | `de.xyntal.plus.monthly`  | `de.xyntal.plus.yearly`  | 3     |
| Pro   | `de.xyntal.pro.monthly`   | `de.xyntal.pro.yearly`   | 2     |
| Ultra | `de.xyntal.ultra.monthly` | `de.xyntal.ultra.yearly` | 1     |

Eine einzige Abo-Gruppe – damit erledigt Apple den Wechsel zwischen den Stufen selbst,
inklusive anteiliger Erstattung, und es kann kein zweites paralleles Abo entstehen.

**Preise stehen ausschließlich in App Store Connect.** Weder App noch Server kennen
Beträge; die App zeigt, was StoreKit liefert. Ein Betrag im Quelltext wäre irgendwann
falsch, und ein falscher Preis neben einem Kaufknopf ist der Grund, aus dem Leute sich
betrogen fühlen. Aus demselben Grund erscheint der Satz „zwei Monate gratis“ nur, wenn der
Jahrespreis tatsächlich dem Zehnfachen des Monatspreises entspricht.

## Was nur Nico tun kann

Ohne diese Schritte lädt die App im Simulator aus der mitgelieferten
StoreKit-Konfiguration, aber auf einem echten Gerät gibt es keine Produkte.

1. **Paid Applications Agreement** in App Store Connect annehmen, Steuer- und Bankdaten
   vollständig hinterlegen. Ohne das liefert Apple keine Produkte aus.
2. **Small Business Program** beantragen, falls noch nicht geschehen: 15 % statt 30 %.
3. **Die sechs Produkte anlegen**, mit genau den Ids aus der Tabelle, in einer Abo-Gruppe
   mit den Stufen aus der Tabelle. Preise setzen, deutsche Anzeigenamen und
   Beschreibungen hinterlegen, Review-Screenshot je Produkt hochladen.
4. **App Store Server API**: Schlüssel erzeugen (Issuer-Id, Key-Id, `.p8`) und dem Server
   als Umgebungsvariablen geben. Ohne diese Konfiguration ist die Apple-Bezahlung am
   Server aus und die Endpunkte antworten mit „nicht konfiguriert“ – bewusst so, statt
   eine ungeprüfte Quittung durchzuwinken.
5. **App Store Server Notifications V2** auf `https://api.xyntal.de/billing/apple/notifications`
   zeigen lassen, getrennt für Sandbox und Produktion.
6. **Rechtliches prüfen lassen.** Die Verbraucherbedingungen und der Kündigungsweg im
   Server (`consumerTerms.ts`, `cancellation.ts`, `/kuendigen`) gelten für Stripe. Für
   Apple-Käufe gelten Apples Erstattungs- und Kündigungsregeln, und gekündigt wird in den
   Apple-Einstellungen. Diese Trennung muss in den AGB stehen, bevor eingereicht wird.
   Offen ist außerdem, ob Käufe durch 16- und 17-Jährige eine eigene Regelung brauchen.

## Zuordnung Kauf → Xyntal-Konto

Über `appAccountToken`. Das ist **nicht** die Nutzer-Id, sondern eine eigene, zufällige
UUID pro Konto (`users.app_account_token`), die der Server über
`GET /billing/apple/token` herausgibt. Die Nutzer-Id selbst läge sonst bei Apple und in
jeder Quittung.

## Endpunkte

| Endpunkt                            | Anmeldung | Zweck |
|-------------------------------------|-----------|-------|
| `GET /billing`                      | ja        | zusätzlich `source` und `canPurchaseInApp` |
| `GET /billing/apple/token`          | ja        | die UUID dieses Kontos |
| `POST /billing/apple/verify`        | ja        | Kauf prüfen und Tarif setzen |
| `POST /billing/apple/notifications` | **nein**  | Apples Benachrichtigungen V2 |
| `POST /billing/checkout`            | ja        | neu: `409`, wenn ein Apple-Abo läuft |

Der Server glaubt dem Client kein einziges Feld: die App nennt nur die Transaktions-Id,
den Rest holt der Server bei Apple und prüft die Signatur gegen Apples Wurzelzertifikate –
und zwar nicht nur bis zur Wurzel, sondern auch darauf, dass das unterste Zertifikat
wirklich für Apples Belege ausgestellt ist (Erweiterung `1.2.840.113635.100.6.11.1`).
Ohne diese Prüfung reicht ein beliebiges Zertifikat unter derselben Wurzel, um sich einen
Kaufbeleg selbst zu signieren.

**Fehlt `canPurchaseInApp` in der Antwort, zeigt die App keinen Kaufknopf.** Ein Server,
der das Feld nicht kennt, kennt auch keine Apple-Käufe. Die stille Richtung ist die sichere.

**Die Sperre gegen Doppelzahlung greift schon bei `GET /billing/apple/token`**, nicht erst
beim Prüfen: Dazwischen hätte Apple bereits abgebucht.

**Ein Kauf, der sich dauerhaft nicht einlösen lässt**, wird vom Server mit Transaktions-Id,
Konto und Grund vermerkt und ist in der Admin-Konsole sichtbar. Erst dann schließt die App
ihn ab. Ein bezahlter Kauf verschwindet nie stillschweigend, und er hängt auch nicht für
immer als Fehler in der App.
`/billing/apple/notifications` hat keine Anmeldung, weil Apple keine hat – die Echtheit
kommt allein aus dem signierten JWS.

Die Benachrichtigungen sind **nicht optional**: ohne sie erfährt der Server von einer
Kündigung, einer Erstattung oder einer geplatzten Zahlung nie, und das Konto behält seinen
Tarif für immer.

## Doppelt zahlen ist gesperrt

In beide Richtungen: läuft ein Stripe-Abo, zeigt die App keinen Kaufknopf und
`/billing/apple/verify` antwortet `409 apple_stripe_active`; läuft ein Apple-Abo, lehnt der
Web-Checkout mit `409 apple_subscription_active` ab.

## Kein Verkauf außerhalb von Profil → Tarif

Kein Banner, keine Sperre, kein Pop-up im Wisch-Stapel, in den Nachrichten oder in der
Community. Das ist eine Produktentscheidung: ein Preis vor dem ersten echten Nutzen ist der
Punkt, an dem jüngere Mitglieder abbrechen, und Verkauf zwischen Kontakten ist genau das
Umfeld, das erfahrene Mitglieder abstößt.

## Offen

- **Was ein Abo in der App überhaupt bringt.** Die bezahlten Vorteile liegen fast alle im
  Web: Arbeitsbereiche, Speicher, Automationen, Agenten, Rollen. In der App wirken nur
  zwei: gemerkte Personen (Free 10, Plus 100, ab Pro unbegrenzt) und Xyntal AI ab Plus.
  Solange das so ist, zahlt vor allem, wer Xyntal auch am Rechner nutzt.
- KI-Guthaben aufladen (eigenes Verbrauchsprodukt) ist nicht gebaut.
- Gutscheine gibt es in der App nicht; Apples Angebotscodes sind ein eigenes System.
- Ob es eine kostenlose Probezeit geben soll. Gibt es eine, muss sie in den
  Pflichtangaben am Kaufknopf stehen.
