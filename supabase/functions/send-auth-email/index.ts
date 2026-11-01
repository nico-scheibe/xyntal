import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type EmailAction =
  | "signup"
  | "magiclink"
  | "recovery"
  | "invite"
  | "email_change"
  | "reauthentication";

type HookPayload = {
  user: {
    email?: string;
    new_email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type: EmailAction;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

type OutgoingEmail = {
  to: string;
  tokenHash: string;
  code?: string;
  subject: string;
  heading: string;
  message: string;
  button: string;
};

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "Xyntal", email: "admin@xyntal.com" };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
} as Record<string, string>)[char] ?? char);

function confirmationUrl(siteUrl: string, redirectTo: string | undefined, tokenHash: string, type: EmailAction) {
  const url = new URL("/auth/v1/verify", siteUrl);
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", type === "signup" ? "email" : type);
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

function actionMessage(action: EmailAction): Omit<OutgoingEmail, "to" | "tokenHash"> {
  switch (action) {
    case "signup":
      return {
        subject: "Bestätige deine E-Mail.",
        heading: "Bestätige deine E-Mail.",
        message: "Mit einem Klick bestätigen wir deine E-Mail-Adresse. Danach kannst du dein Xyntal-Profil einrichten und dich mit Projekten und Mitstreitern verbinden.",
        button: "E-Mail-Adresse bestätigen",
      };
    case "recovery":
      return {
        subject: "Setze dein Xyntal-Passwort zurück",
        heading: "Neues Passwort festlegen",
        message: "Über den sicheren Link kannst du ein neues Passwort für dein Xyntal-Konto festlegen.",
        button: "Passwort zurücksetzen",
      };
    case "magiclink":
      return {
        subject: "Dein Login-Link für Xyntal",
        heading: "Melde dich bei Xyntal an",
        message: "Klicke auf den Button, um dich sicher bei deinem Xyntal-Konto anzumelden.",
        button: "Bei Xyntal anmelden",
      };
    case "invite":
      return {
        subject: "Du bist zu Xyntal eingeladen",
        heading: "Willkommen bei Xyntal",
        message: "Du wurdest eingeladen, Xyntal beizutreten. Mit dem Button kannst du die Einladung annehmen.",
        button: "Einladung annehmen",
      };
    case "email_change":
      return {
        subject: "Bestätige deine neue E-Mail-Adresse",
        heading: "E-Mail-Adresse ändern",
        message: "Bestätige die Änderung deiner E-Mail-Adresse für dein Xyntal-Konto.",
        button: "E-Mail-Adresse bestätigen",
      };
    case "reauthentication":
      return {
        subject: "Bestätige deine Xyntal-Sicherheitsaktion",
        heading: "Sicherheitsaktion bestätigen",
        message: "Nutze den sicheren Link, um die angeforderte Aktion für dein Konto zu bestätigen.",
        button: "Aktion bestätigen",
      };
  }
}

function brandedHtml(message: OutgoingEmail, link: string) {
  const safeHeading = escapeHtml(message.heading);
  const safeMessage = escapeHtml(message.message);
  const safeButton = escapeHtml(message.button);
  const safeLink = escapeHtml(link);
  // Sign-in mails also carry the one-time code, for the Xyntal app and for
  // reading the mail on another device than the one signing in.
  const codeBlock = message.code
    ? `<p style="margin:26px 0 8px;color:#b4b4be;font-size:14px;line-height:1.5">Oder gib diesen Code in der Xyntal-App ein:</p><p style="margin:0;font-size:32px;line-height:1.2;letter-spacing:.28em;font-weight:bold;font-family:Menlo,Consolas,monospace;color:#f5f5f7">${escapeHtml(message.code)}</p>`
    : "";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${safeHeading}</title></head><body style="margin:0;background:#07070b;color:#f5f5f7;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07070b"><tr><td align="center" style="padding:40px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td align="center" style="padding:0 0 26px"><a href="https://xyntal.de/"><img src="https://xyntal.de/email/logo.png" width="113" height="31" alt="Xyntal" style="display:block;border:0"></a></td></tr><tr><td style="padding:1px;border-radius:24px;background:#26262f"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px;background:#121219;border-radius:23px"><div style="height:4px;background:linear-gradient(90deg,#a855f7,#ec4899,#6366f1);border-radius:4px"></div><p style="margin:28px 0 8px;color:#34d399;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Xyntal</p><h1 style="margin:0 0 16px;font-size:30px;line-height:1.15">${safeHeading}</h1><p style="margin:0 0 28px;color:#b4b4be;font-size:16px;line-height:1.6">${safeMessage}</p><a href="${safeLink}" style="display:inline-block;padding:16px 26px;border-radius:999px;background:#a855f7;background-image:linear-gradient(100deg,#a855f7,#ec4899 50%,#6366f1);color:#fff;font-weight:bold;text-decoration:none">${safeButton} &rarr;</a>${codeBlock}<hr style="margin:28px 0 16px;border:0;border-top:1px solid #26262f"><p style="margin:0;color:#8a8a95;font-size:13px;line-height:1.5">Wenn du diese Aktion nicht angefordert hast, kannst du diese E-Mail ignorieren.</p></td></tr></table></td></tr><tr><td align="center" style="padding:24px 10px 0;color:#8a8a95;font-size:12px">Stop swiping. <span style="color:#e879f9">Start building.</span><br><a href="https://xyntal.de/impressum" style="color:#8a8a95">Impressum</a> · <a href="https://xyntal.de/impressum#datenschutz" style="color:#8a8a95">Datenschutz</a></td></tr></table></td></tr></table></body></html>`;
}

async function sendWithBrevo(apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    // Do not log the request body, email address, token, link, or API key.
    console.error("Brevo transactional send failed", response.status);
    throw new Error(`Brevo returned HTTP ${response.status}`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const apiKey = Deno.env.get("BREVO_API_KEY");
  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  const signupTemplateId = Number(Deno.env.get("BREVO_SIGNUP_TEMPLATE_ID") ?? "5");
  if (!apiKey || !hookSecret || !Number.isInteger(signupTemplateId) || signupTemplateId < 1) {
    console.error("Auth email hook is missing required configuration");
    return new Response("Auth email provider is not configured", { status: 500 });
  }

  const rawBody = await request.text();
  let payload: HookPayload;
  try {
    const verifier = new Webhook(hookSecret.replace(/^v1,whsec_/, ""));
    payload = verifier.verify(rawBody, Object.fromEntries(request.headers)) as HookPayload;
  } catch {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  const action = payload.email_data?.email_action_type;
  const email = payload.user?.email?.trim();
  const siteUrl = payload.email_data?.site_url;
  if (!action || !email || !siteUrl) return new Response("Invalid auth email payload", { status: 400 });

  const sharedMessage = actionMessage(action);
  const messages: OutgoingEmail[] = [];

  // Supabase uses reversed token/hash field names for secure email-change flows.
  if (action === "email_change" && payload.email_data.token_hash_new && payload.user.email) {
    messages.push({ to: payload.user.email, tokenHash: payload.email_data.token_hash_new, ...sharedMessage });
  }
  if (action === "email_change" && payload.email_data.token_hash && payload.user.new_email) {
    messages.push({ to: payload.user.new_email, tokenHash: payload.email_data.token_hash, ...sharedMessage });
  }
  if (messages.length === 0 && payload.email_data.token_hash) {
    messages.push({
      to: action === "email_change" ? payload.user.new_email ?? email : email,
      tokenHash: payload.email_data.token_hash,
      code: action === "magiclink" && /^\d{6,10}$/.test(payload.email_data.token ?? "") ? payload.email_data.token : undefined,
      ...sharedMessage,
    });
  }
  if (messages.length === 0) return new Response("Auth email token is missing", { status: 400 });

  try {
    await Promise.all(messages.map(async (message) => {
      const link = confirmationUrl(siteUrl, payload.email_data.redirect_to, message.tokenHash, action);
      if (action === "signup") {
        await sendWithBrevo(apiKey, {
          templateId: signupTemplateId,
          subject: message.subject,
          sender: SENDER,
          to: [{ email: message.to }],
          params: { confirmation_url: link },
          tags: ["xyntal-auth-signup"],
        });
      } else {
        await sendWithBrevo(apiKey, {
          sender: SENDER,
          to: [{ email: message.to }],
          subject: message.subject,
          htmlContent: brandedHtml(message, link),
          textContent: `${message.heading}\n\n${message.message}\n\n${message.button}: ${link}\n\n${message.code ? `Oder gib diesen Code in der Xyntal-App ein: ${message.code}\n\n` : ""}Wenn du diese Aktion nicht angefordert hast, ignoriere diese E-Mail.`,
          tags: [`xyntal-auth-${action}`],
        });
      }
    }));
  } catch {
    return new Response("Email delivery failed", { status: 502 });
  }

  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
});
