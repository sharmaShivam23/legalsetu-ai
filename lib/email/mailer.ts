// ==========================================================
// LegalSetu — outbound email
// ----------------------------------------------------------
// Uses generic SMTP so it works with whatever the deployer
// already has — a Gmail app password, SendGrid's SMTP relay,
// Mailtrap for testing, Resend's SMTP interface — without
// hard-coding a single vendor's SDK.
//
// Configure via:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//   SMTP_FROM_EMAIL, SMTP_FROM_NAME (optional)
//
// No SMTP configured -> the same graceful-degrade pattern the
// rest of this app uses for AI providers: the code is logged
// clearly instead of the request failing outright, so the OTP
// flow is fully usable in local development before anyone wires
// up a real mail account. This is NEVER a silent fallback in
// production — every send logs which path it took.
// ==========================================================

import { logger } from "@/lib/logging/logger";

let transporterPromise: Promise<import("nodemailer").Transporter | null> | null = null;

/** First non-empty value among the given env names, trimmed. */
function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Both SMTP_* and MAIL_* spellings are accepted. Deployments name these
 * either way, and a credential set under the "wrong" prefix used to be
 * silently ignored — every code fell back to the console log.
 */
function smtpConfig() {
  const host = env("SMTP_HOST", "MAIL_HOST");
  const user = env("SMTP_USER", "MAIL_USER");
  let pass = env("SMTP_PASS", "MAIL_PASS", "MAIL_PASSWORD");
  // Google shows app passwords in groups of four ("abcd efgh ijkl mnop");
  // pasted like that they fail auth, so drop the spaces for Gmail.
  if (pass && host?.includes("gmail")) pass = pass.replace(/\s+/g, "");
  const port = Number(env("SMTP_PORT", "MAIL_PORT") ?? 587);
  return { host, user, pass, port };
}

function isSmtpConfigured(): boolean {
  const { host, user, pass } = smtpConfig();
  return Boolean(host && user && pass);
}

async function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (!transporterPromise) {
    const { host, user, pass, port } = smtpConfig();
    transporterPromise = import("nodemailer").then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host,
        port,
        // 465 is implicit TLS; anything else negotiates STARTTLS.
        secure: port === 465,
        auth: { user, pass },
      })
    );
  }
  return transporterPromise;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback for clients that don't render HTML. */
  text: string;
}

export interface SendEmailResult {
  delivered: boolean;
  /** True when this only went to the server console, not a real inbox. */
  devMode: boolean;
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<SendEmailResult> {
  const transporter = await getTransporter();

  if (!transporter) {
    // Dev-mode fallback. Loud and unmistakable in the server log, so a
    // developer testing the OTP flow can find the code immediately —
    // and so nobody mistakes this for a real delivery in production.
    logger.warn("SMTP not configured — email logged instead of sent", {
      to,
      subject,
    });
    // eslint-disable-next-line no-console
    console.log(
      `\n========== EMAIL (dev mode — SMTP not configured) ==========\n` +
        `To: ${to}\nSubject: ${subject}\n\n${text}\n` +
        `==============================================================\n`
    );
    return { delivered: false, devMode: true };
  }

  const fromName = env("SMTP_FROM_NAME", "MAIL_FROM_NAME") ?? "LegalSetu";
  // Gmail rewrites any other From address to the authenticated account,
  // so default to that account rather than inventing one.
  const fromEmail = env("SMTP_FROM_EMAIL", "MAIL_FROM", "MAIL_FROM_EMAIL") ?? smtpConfig().user;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text,
    });
    logger.info("Email sent", { to, subject });
    return { delivered: true, devMode: false };
  } catch (err) {
    logger.error("Email send failed", { to, errorType: String(err).slice(0, 200) });
    // The caller decides how to respond to the user; failing to send an
    // email must never crash the request that triggered it.
    return { delivered: false, devMode: false };
  }
}
