// Envoi des notifications. Chaque message est toujours enregistré : il reste consultable
// par le client sur son lien sécurisé, même sans fournisseur SMS / e-mail configuré.
import { db } from "./db";
import type { Channel } from "./validation";

type Target = { orderId?: string; requestId?: string };

export type NotifyInput = Target & {
  channel: Channel;
  phone?: string | null;
  email?: string | null;
  event: string;
  body: string;
};

async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "SIMULATED" as const;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "Pharma AI Connect <onboarding@resend.dev>", to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
  return "SENT" as const;
}

async function sendTwilio(to: string, body: string, whatsapp: boolean) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = whatsapp ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) return "SIMULATED" as const;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: whatsapp ? `whatsapp:${to}` : to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}`);
  return "SENT" as const;
}

/** N'échoue jamais : une panne du fournisseur ne doit pas bloquer une commande. */
export async function notify(input: NotifyInput) {
  const { channel, event, body } = input;
  let recipient: string | null = null;
  let status: string = "LINK_ONLY";
  let error: string | null = null;
  try {
    if (channel === "EMAIL" && input.email) {
      recipient = input.email;
      status = await sendEmail(input.email, "Pharma AI Connect", body);
    } else if ((channel === "SMS" || channel === "WHATSAPP") && input.phone) {
      recipient = input.phone;
      status = await sendTwilio(input.phone, body, channel === "WHATSAPP");
    }
  } catch (e) {
    status = "FAILED";
    error = e instanceof Error ? e.message : String(e);
  }
  return db.notification.create({
    data: { orderId: input.orderId, requestId: input.requestId, channel, recipient, event, body, status, error },
  });
}

export const CHANNEL_LABEL: Record<string, string> = {
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  LINK: "Lien sécurisé uniquement",
};

/** Mode démonstration : affiche à l'écran les codes qui n'ont pas pu être réellement envoyés. */
export function demoMode() {
  return process.env.DEMO_MODE === "true" || process.env.NODE_ENV !== "production";
}
