// Auth-Hook „before user created“: Bot-Schutz bei der Registrierung.
// Supabase fragt diese Funktion, bevor ein neues Konto entsteht. Konten mit E-Mail und
// Passwort oder per SMS-Code brauchen ein gültiges Cloudflare-Turnstile-Token
// („Bestätige, dass du kein Bot bist“), das die Website beim Registrieren in
// user_metadata.turnstile mitschickt. So lässt sich die Prüfung auch nicht umgehen,
// indem ein Bot Supabase direkt anspricht.
//
// Ohne TURNSTILE_SECRET_KEY lässt die Funktion alles durch (Schutz aus).
// Google, Discord, LinkedIn und Apple prüfen selbst und bleiben unberührt; bestehende
// Konten melden sich ganz normal an, der Hook läuft nur beim Anlegen.
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type HookPayload = {
  user?: {
    email?: string;
    phone?: string;
    app_metadata?: { provider?: string };
    user_metadata?: Record<string, unknown>;
  };
};

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const CHECKED_PROVIDERS = new Set(["email", "phone"]);
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
// GoTrue gibt http_code und message so an die Website weiter.
const reject = (message: string) => json({ error: { http_code: 400, message } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const hookSecret = Deno.env.get("BEFORE_USER_CREATED_HOOK_SECRET") ?? "";
  if (!hookSecret) return new Response("Hook secret missing", { status: 500 });

  const rawBody = await request.text();
  let payload: HookPayload;
  try {
    const verifier = new Webhook(hookSecret.replace(/^v1,whsec_/, ""));
    payload = verifier.verify(rawBody, Object.fromEntries(request.headers)) as HookPayload;
  } catch {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
  if (!secret) return json({});
  const provider = payload.user?.app_metadata?.provider ?? "email";
  if (!CHECKED_PROVIDERS.has(provider)) return json({});

  const token = String(payload.user?.user_metadata?.turnstile ?? "");
  if (!token || token.length > 2048) {
    return reject("Bitte bestätige zuerst, dass du kein Bot bist, und versuche es dann erneut.");
  }
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    const res = await fetch(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
    const result = await res.json() as { success?: boolean; "error-codes"?: string[] };
    if (result.success) return json({});
    console.log("turnstile refused", JSON.stringify(result["error-codes"] ?? []));
    return reject("Die Bot-Prüfung ist abgelaufen oder ungültig. Bitte lade die Seite neu und versuche es erneut.");
  } catch (err) {
    // Cloudflare nicht erreichbar: lieber durchlassen als echte Menschen aussperren.
    console.error("turnstile check failed", String(err));
    return json({});
  }
});
