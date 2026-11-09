// Supabase-Verbindung. Beide Werte sind öffentlich und dürfen im Browser stehen –
// geschützt werden die Daten durch die Row-Level-Security-Regeln in supabase/schema.sql.
// Niemals den "secret" / "service_role" Key hier eintragen!
window.XYNTAL_CONFIG = {
  supabaseUrl: "https://db.xyntal.de",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzk0MTc3MzEwLCJleHAiOjE5NTE4NTczMTB9.1H1nAG_eqZLMIsCvkNDqdCGDluTM0p3zhdx5aWLvToQ",
  // Cloudflare Turnstile („kein Bot“) bei der Registrierung: Site Key aus Cloudflare → Turnstile.
  // Öffentlich, darf hier stehen. Leer = aus. Den Secret Key nie hier eintragen (gehört in die .env von xyntal-db).
  turnstileSiteKey: "",
};
