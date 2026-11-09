// Xyntal – eine Anmeldung für xyntal.de, www.xyntal.de und admin.xyntal.de.
// Der Browser trennt den Speicher (localStorage) je Adresse; deshalb liegen die Sitzungs-Tokens
// zusätzlich in einem Cookie für alle xyntal.de-Adressen. Beim Laden jeder Seite und bei jedem
// Zugriff des Supabase-Clients wird abgeglichen: Das Cookie gilt, localStorage ist die Kopie,
// aus der die übrigen Skripte lesen. Muss vor allen anderen Skripten laden.
(() => {
  const KEY = "sb-db-auth-token";        // Sitzung von supabase-js im localStorage
  const COOKIE = "xy-sess";              // Teile: xy-sess.0, xy-sess.1 …
  const MARK = "xy-sess-on";             // „hier wird abgeglichen“: fehlt das Sitzungs-Cookie, ist man abgemeldet
  const CACHE = "xyntal-acct";           // Name und Foto fürs Kontomenü (account-menu.js)
  const CHUNK = 3000, MAX_AGE = 60 * 60 * 24 * 400;
  const host = location.hostname;
  const domain = host === "xyntal.de" || host.endsWith(".xyntal.de") ? ".xyntal.de" : "";   // lokal: nur diese Adresse
  const attrs = `; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${location.protocol === "https:" ? "; Secure" : ""}`;

  const jar = () => {
    const out = {};
    for (const part of document.cookie.split("; ")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
    }
    return out;
  };
  const put = (name, value) => { document.cookie = `${name}=${value}; Max-Age=${MAX_AGE}${attrs}`; };
  const drop = (name) => { document.cookie = `${name}=; Max-Age=0${attrs}`; };
  const claims = (jwt) => {
    const body = String(jwt).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(Array.from(atob(body), (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")));
  };

  // null = kein Cookie, undefined = unvollständig oder unlesbar
  function readCookie() {
    const all = jar();
    let value = "";
    for (let i = 0; all[`${COOKIE}.${i}`] !== undefined; i++) value += all[`${COOKIE}.${i}`];
    if (!value) return null;
    try {
      const [access_token, refresh_token, exp] = value.split("~").map(decodeURIComponent);
      const c = claims(access_token);
      if (!refresh_token || !c.sub) return undefined;
      return { access_token, refresh_token, expires_at: Number(exp) || c.exp || 0, claims: c };
    } catch { return undefined; }
  }
  function writeCookie(session) {
    const value = [session.access_token, session.refresh_token, session.expires_at || ""].map(encodeURIComponent).join("~");
    const all = jar();
    const parts = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < parts; i++) put(`${COOKIE}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    for (let i = parts; all[`${COOKIE}.${i}`] !== undefined; i++) drop(`${COOKIE}.${i}`);
    put(MARK, "1");
  }
  function clearCookie() {
    const all = jar();
    for (let i = 0; all[`${COOKIE}.${i}`] !== undefined; i++) drop(`${COOKIE}.${i}`);
    put(MARK, "1");
  }

  const readLocal = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      return s && s.access_token && s.refresh_token ? s : null;
    } catch { return null; }
  };
  // Sitzung aus dem Cookie: Die Nutzerdaten stehen im Token; die vollständigen holt supabase-js beim nächsten Erneuern.
  function fromCookie(c, local) {
    const k = c.claims;
    const user = local && local.user && local.user.id === k.sub ? local.user : {
      id: k.sub, aud: k.aud || "authenticated", role: k.role || "authenticated", email: k.email || "", phone: k.phone || "",
      app_metadata: k.app_metadata || {}, user_metadata: k.user_metadata || {}, is_anonymous: !!k.is_anonymous,
    };
    return {
      access_token: c.access_token, refresh_token: c.refresh_token, token_type: "bearer",
      expires_at: c.expires_at, expires_in: Math.max(0, c.expires_at - Math.floor(Date.now() / 1000)), user,
    };
  }

  // Cookie und localStorage angleichen
  function sync() {
    try {
      const local = readLocal();
      const c = readCookie();
      if (c) {
        const same = local && local.access_token === c.access_token && local.refresh_token === c.refresh_token;
        // Neuer ist, was später abläuft: Skripte ohne diesen Abgleich können nur localStorage erneuert haben.
        if (local && !same && (local.expires_at || 0) > c.expires_at) writeCookie(local);
        else if (!same) {
          if (!local || !local.user || local.user.id !== c.claims.sub) localStorage.removeItem(CACHE);
          localStorage.setItem(KEY, JSON.stringify(fromCookie(c, local)));
        }
      } else if (c === null && jar()[MARK] !== undefined) {
        // Auf einer anderen xyntal.de-Adresse abgemeldet
        if (localStorage.getItem(KEY) !== null) { localStorage.removeItem(KEY); localStorage.removeItem(CACHE); }
      } else if (local) writeCookie(local);   // erste Seite nach der Umstellung oder Cookie beschädigt
      else if (c === undefined) clearCookie();
      // Wer nie angemeldet war, bekommt kein Cookie.
    } catch { /* ohne Speicher oder Cookies: jede Adresse für sich wie bisher */ }
  }

  // Speicher für supabase-js (createClient(…, { auth: { storage } })): schreibt beides, liest abgeglichen
  const storage = {
    getItem(key) {
      if (key === KEY) sync();
      return localStorage.getItem(key);
    },
    setItem(key, value) {
      localStorage.setItem(key, value);
      if (key !== KEY) return;
      try {
        const s = JSON.parse(value);
        if (s && s.access_token && s.refresh_token) writeCookie(s); else clearCookie();
      } catch { /* Cookie bleibt, der nächste Abgleich richtet es */ }
    },
    removeItem(key) {
      localStorage.removeItem(key);
      if (key === KEY) { try { clearCookie(); } catch { /* egal */ } }
    },
  };

  window.XyntalSession = {
    storage,
    sync,
    // Abmelden ohne Supabase-Client (account-menu.js)
    clear() { try { localStorage.removeItem(KEY); } catch { /* egal */ } try { clearCookie(); } catch { /* egal */ } },
    // Optionen für window.supabase.createClient
    clientOptions: { auth: { storage } },
  };
  sync();
})();
