// Profil-Symbole („Avatar-Items“): kuratierte Motive als inline SVG, weiß auf dem Farbverlauf der .avatar-Klassen.
// Welches Symbol in welcher Stufe freigeschaltet ist, entscheidet allein die Datenbank
// (avatar_items() und avatar_item_unlocked_by() in supabase/migrations/20261115120000_avatar_items.sql).
// Diese Datei liefert nur die Motive; ein Symbol ohne Eintrag hier wird wie fehlend behandelt (Initialen).
(() => {
  // Größe und Farbe stehen im Markup selbst, damit das Symbol überall im .avatar passt (weiß, 56 % der Fläche)
  const icon = body => `<svg viewBox="0 0 24 24" style="width:56%;height:56%;display:block;color:#fff" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  window.AVATAR_ITEMS = {
    // Basis (alle freigeschalteten Mitglieder)
    berg: { name: 'Berg', svg: icon('<path d="M2.5 19.5 9 8.5l3.5 5.5 2.5-3.5 6.5 9z"/>') },
    kompass: { name: 'Kompass', svg: icon('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.3 4.7-4.7 2.3 2.3-4.7z"/>') },
    schachfigur: { name: 'Schachkönig', svg: icon('<path d="M12 2.5v3.5M10.3 4.2h3.4"/><path d="M8.5 9.5h7l1 2.5-1.8 1.5.8 5.5H8.5l.8-5.5L7.5 12z"/><path d="M6.5 21h11"/>') },
    gluehbirne: { name: 'Glühbirne', svg: icon('<path d="M9 17.5h6M9.5 20.5h5"/><path d="M12 2.8a6.2 6.2 0 0 0-3.9 11c.7.6 1.1 1.4 1.1 2.2v.5h5.6v-.5c0-.8.4-1.6 1.1-2.2A6.2 6.2 0 0 0 12 2.8z"/>') },
    rakete: { name: 'Rakete', svg: icon('<path d="M12 2.5c3 2.2 4.2 5.6 3.8 9.5L12 16.5 8.2 12C7.8 8.1 9 4.7 12 2.5z"/><circle cx="12" cy="9" r="1.6"/><path d="M8.2 12l-2.7 2.2v3l2.7-1.2M15.8 12l2.7 2.2v3l-2.7-1.2M10 16.5 12 21.5l2-5"/>') },
    leuchtturm: { name: 'Leuchtturm', svg: icon('<path d="M9 21 10 8h4l1 13z"/><path d="M8.5 8h7M9.5 8 10 5.5h4L14.5 8M4 6.5 8 8M20 6.5 16 8M2.5 11h2.5M19 11h2.5"/>') },
    // Profil-Set (mit ausgefülltem Profil)
    eule: { name: 'Eule', svg: icon('<path d="M7.5 8C7 4.5 9 3 12 3s5 1.5 4.5 5V16a4.5 4.5 0 0 1-9 0z"/><circle cx="10" cy="9.5" r="1.4"/><circle cx="14" cy="9.5" r="1.4"/><path d="M11.3 12.5 12 14l.7-1.5M10 20.5v1M14 20.5v1M7.5 8 6.5 5M16.5 8l1-3"/>') },
    kleeblatt: { name: 'Kleeblatt', svg: icon('<circle cx="9" cy="8.5" r="3.2"/><circle cx="15" cy="8.5" r="3.2"/><circle cx="9" cy="14.5" r="3.2"/><circle cx="15" cy="14.5" r="3.2"/><path d="M12 17.5V22"/>') },
    stern: { name: 'Stern', svg: icon('<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 2.9 1.1-6.3-4.6-4.4 6.3-.9z"/>') },
    anker: { name: 'Anker', svg: icon('<circle cx="12" cy="5" r="2"/><path d="M12 7v13.5M8.5 9.5h7M5 14.5a7 7 0 0 0 14 0M5 14.5l-1.5-1.5M19 14.5l1.5-1.5"/>') },
    buch: { name: 'Buch', svg: icon('<path d="M12 6.5C10 5 7.2 4.5 3.5 5.2v13.3c3.7-.7 6.5-.2 8.5 1.3 2-1.5 4.8-2 8.5-1.3V5.2c-3.7-.7-6.5-.2-8.5 1.3zM12 6.5v13.3"/>') },
    bruecke: { name: 'Brücke', svg: icon('<path d="M2.5 17.5a9.5 9.5 0 0 1 19 0M2.5 20.5h19M7.5 9.1v8.4M12 8v9.5M16.5 9.1v8.4"/>') },
    schluessel: { name: 'Schlüssel', svg: icon('<circle cx="7.5" cy="12" r="4.2"/><path d="M11.7 12h9.8M17.5 12v3M21 12v2.5"/>') },
    segel: { name: 'Segel', svg: icon('<path d="M12 3v16.5M12 4l7 12.5h-7zM11 7.5l-5.5 9H11M3.5 18.5h17l-2.5 2.5H6z"/>') },
    fackel: { name: 'Fackel', svg: icon('<path d="M12 2.5c2 2.5 3.2 4.3 2.2 6.2-.4.8-1.2 1.3-2.2 1.3s-1.8-.5-2.2-1.3C8.8 6.8 10 5 12 2.5z"/><path d="M9.8 11.5h4.4l-.8 9.5h-2.8z"/>') },
    krone: { name: 'Krone', svg: icon('<path d="M3.5 8.5 8 12.5 12 6.5l4 6 4.5-4-1.8 10.5H5.3z"/>') },
    zielscheibe: { name: 'Zielscheibe', svg: icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.8"/>') },
    zahnrad: { name: 'Zahnrad', svg: icon('<circle cx="12" cy="12" r="8" stroke-width="3.4" stroke-dasharray="3.1 2.4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/>') },
  };
})();
