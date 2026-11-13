// Xyntal – Suchleiste in der Kopfzeile (alle Seiten, site-search.css).
// Sucht in den Seiten der Website und in den Abschnitten der aktuellen Seite.
// ⌘K / Strg+K oder „/“ springt in die Leiste. Läuft ohne Bibliotheken.
(() => {
  const nav = document.querySelector(".nav .wrap");
  const top = document.querySelector(".top__right");
  if ((!nav && !top) || document.querySelector(".site-search")) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ACTIONS = [
    { label: "Nachricht schreiben", href: "/nachrichten?neu=1", keys: "chat dm neue nachricht senden" },
    { label: "Community-Beitrag erstellen", href: "/community?neu=1", keys: "post update frage erfolg teilen" },
    { label: "Xyntal-Karte bearbeiten", href: "/profil#karte", keys: "karte profil gestalten vorschau" },
    { label: "Profil bearbeiten", href: "/profil", keys: "konto name bio avatar profil" },
  ];
  const PAGES = [
    { label: "Startseite", href: "/", keys: "home start homepage" },
    { label: "App-Demo", href: "/demo", keys: "app desktop projekte aufgaben workspaces ausprobieren" },
    { label: "Matching", href: "/matching", keys: "passung punkte rechnung gewichte arbeitsstil vorschläge" },
    { label: "Preise", href: "/preise", keys: "tarife kosten plan free pro business abo" },
    { label: "Für Firmen", href: "/unternehmen", keys: "unternehmen firma business festpreis team" },
    { label: "Über uns", href: "/ueber-uns", keys: "über uns xyntal warum idee mission kontakt" },
    { label: "Beta-Programm", href: "/beta", keys: "beta tester testen bewerben bewerbung früher zugang" },
    { label: "Mitglieder", href: "/mitglieder", keys: "profile menschen leute suchen finden team" },
    { label: "Für dich", href: "/fuer-dich", keys: "matching vorschläge passende leute team" },
    { label: "Community", href: "/community", keys: "feed beiträge fragen erfolge" },
    { label: "Projekte", href: "/projekte", keys: "projekt rollen mitmachen offene" },
    { label: "Nachrichten", href: "/nachrichten", keys: "chat dm inbox gruppen" },
    { label: "Mein Profil", href: "/profil", keys: "konto account" },
  ];
  const LEGAL = [
    { label: "Impressum", href: "/impressum", keys: "rechtliches kontakt anbieter" },
    { label: "Datenschutz", href: "/datenschutz", keys: "datenschutzerklärung dsgvo daten privatsphäre rechte" },
    { label: "AGB", href: "/agb", keys: "geschäftsbedingungen nutzungsbedingungen rechtliches" },
    { label: "Widerruf", href: "/widerruf", keys: "widerrufsbelehrung widerrufsrecht rechtliches" },
    { label: "Community-Richtlinien", href: "/community-richtlinien", keys: "regeln verhalten melden" },
  ];
  const signedIn = () => !!document.querySelector("[data-acct-logout]");
  const account = () => signedIn()
    ? [
        { label: "Einstellungen", href: "/profil#sicherheit", keys: "konto sicherheit passwort email" },
        { label: "Ausloggen", action: "logout", keys: "abmelden sign out log out" },
      ]
    : [
        { label: "Login", href: "/login", keys: "anmelden einloggen sign in" },
        { label: "Konto anlegen", href: "/login#registrieren", keys: "registrieren mitglied werden signup" },
      ];

  // Abschnitte der aktuellen Seite, benannt nach ihrer Überschrift
  function sections() {
    return [...document.querySelectorAll("main section[id]")]
      .map((s) => {
        const h = s.querySelector("h1, h2");
        const label = h?.textContent.replace(/\s+/g, " ").trim();
        return label ? { label, target: s, keys: s.id } : null;
      })
      .filter(Boolean);
  }

  const groups = () => [
    ["Seiten", PAGES],
    ["Auf dieser Seite", sections()],
    ["Aktionen", signedIn() ? ACTIONS : []],
    ["Konto & Rechtliches", [...account(), ...LEGAL]],
  ];

  // Jedes Wort der Eingabe muss vorkommen; Treffer im Namen und am Wortanfang stehen oben
  const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function score(words, item) {
    const en = (window.XYNTAL_EN || {})[item.label] || "";
    const name = fold(item.label + " " + en);
    const all = name + " " + fold(item.keys || "");
    let total = 0;
    for (const w of words) {
      if (!all.includes(w)) return 0;
      if (name.startsWith(w)) total += 8;
      else if (name.includes(" " + w)) total += 6;
      else if (name.includes(w)) total += 4;
      else if ((" " + all).includes(" " + w)) total += 2;
      else total += 1;
    }
    return total;
  }

  const box = document.createElement("div");
  box.className = "site-search";
  box.setAttribute("role", "search");
  box.innerHTML = `
    <div class="site-search__bar">
      <input class="site-search__input" type="text" placeholder="Suchen …" aria-label="Website durchsuchen" role="combobox" aria-expanded="false" aria-controls="site-search-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" enterkeyhint="search">
      <button class="site-search__icon" type="button" tabindex="-1" aria-label="Suche öffnen">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      </button>
    </div>
    <div class="site-search__panel" id="site-search-list" role="listbox" aria-label="Treffer" hidden></div>`;
  if (nav) nav.insertBefore(box, nav.querySelector(".nav-toggle"));
  else top.prepend(box);

  const input = box.querySelector("input");
  const panel = box.querySelector(".site-search__panel");
  const icon = box.querySelector(".site-search__icon");
  let items = [], sel = 0;

  function show(open) {
    panel.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    if (!open) input.removeAttribute("aria-activedescendant");
  }

  function mark() {
    panel.querySelectorAll(".site-search__item").forEach((b) => {
      const on = +b.dataset.i === sel;
      b.setAttribute("aria-selected", String(on));
      if (on) { input.setAttribute("aria-activedescendant", b.id); b.scrollIntoView({ block: "nearest" }); }
    });
  }

  function render() {
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    items = [];
    panel.textContent = "";
    if (!words.length) { show(false); return; }
    for (const [name, entries] of groups()) {
      const found = entries
        .map((e) => ({ e, s: score(words, e) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
      if (!found.length) continue;
      const head = document.createElement("div");
      head.className = "site-search__group";
      head.textContent = name;
      panel.appendChild(head);
      for (const { e } of found) {
        const i = items.push(e) - 1;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "site-search__item";
        b.id = "site-search-item-" + i;
        b.dataset.i = i;
        b.tabIndex = -1;
        b.setAttribute("role", "option");
        const label = document.createElement("span");
        label.textContent = e.label;
        const where = document.createElement("span");
        where.setAttribute("data-no-i18n", "");
        where.textContent = e.href ? e.href.split("?")[0] : e.target ? "#" + e.target.id : "";
        b.append(label, where);
        panel.appendChild(b);
      }
    }
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "site-search__empty";
      empty.textContent = "Nichts gefunden";
      panel.appendChild(empty);
    }
    sel = 0;
    show(true);
    mark();
  }

  function run(item) {
    if (!item) return;
    input.value = "";
    show(false);
    input.blur();
    if (item.target) {
      item.target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", "#" + item.target.id);
    } else if (item.action === "logout") {
      document.querySelector("[data-acct-logout]")?.click();
    } else {
      location.href = item.href;
    }
  }

  input.addEventListener("input", render);
  input.addEventListener("focus", () => { if (input.value.trim()) render(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && items.length) { e.preventDefault(); sel = (sel + 1) % items.length; mark(); }
    else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; mark(); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); input.value = ""; show(false); input.blur(); }
  });
  // Klicks in der Leiste dürfen dem Feld den Fokus nicht nehmen
  panel.addEventListener("mousedown", (e) => e.preventDefault());
  icon.addEventListener("mousedown", (e) => e.preventDefault());
  panel.addEventListener("mousemove", (e) => {
    const b = e.target.closest(".site-search__item");
    if (b && +b.dataset.i !== sel) { sel = +b.dataset.i; mark(); }
  });
  panel.addEventListener("click", (e) => {
    const b = e.target.closest(".site-search__item");
    if (b) run(items[+b.dataset.i]);
  });
  icon.addEventListener("click", () => {
    if (document.activeElement !== input) input.focus();          // ausklappen
    else if (items.length && !panel.hidden) run(items[sel]);
    else if (!input.value.trim()) input.blur();                   // leer: wieder einklappen
  });
  box.addEventListener("focusout", (e) => { if (!box.contains(e.relatedTarget)) show(false); });

  document.addEventListener("keydown", (e) => {
    const el = document.activeElement;
    const typing = /INPUT|TEXTAREA|SELECT/.test(el?.tagName) || el?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (el === input) input.blur(); else { input.focus(); input.select(); }
    } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      input.focus();
    }
  });
})();
