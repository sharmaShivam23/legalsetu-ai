// ==========================================================
// LegalSetu — transactional email templates
// ----------------------------------------------------------
// Table-based layout with inline styles throughout, which is
// the only markup subset that renders consistently across Gmail,
// Outlook (desktop and web) and Apple Mail. No flexbox, no
// external stylesheet, no CSS grid — all of that is stripped or
// mis-rendered by at least one major client.
//
// The logo is built from HTML/CSS, not an image. Most mail
// clients block remote images by default until the user clicks
// "show images", which would leave the single most important
// email — the one with the verification code — looking broken
// on first open. A CSS badge always renders.
//
// Gradients carry a solid bgcolor fallback: Outlook desktop ignores
// background-image entirely and would otherwise show white text on
// a white band.
// ==========================================================

const NAVY = "#0b1120";
const NAVY_2 = "#1e293b";
const BRAND_BLUE = "#2563eb";
const BLUE_SOFT = "#eff6ff";
const GOLD = "#e8c15c";
const INK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const CANVAS = "#eef2f7";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',Consolas,Menlo,'Courier New',monospace";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface LayoutInput {
  /** Inbox preview line, shown next to the subject and hidden in the body. */
  preheader: string;
  bodyHtml: string;
}

/** Shared header/footer shell every email is wrapped in. */
function layout({ preheader, bodyHtml }: LayoutInput): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>LegalSetu</title>
</head>
<body style="margin:0;padding:0;background-color:${CANVAS};font-family:${FONT};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CANVAS}" style="background-color:${CANVAS};padding:36px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.10);">

          <!-- Header band -->
          <tr>
            <td bgcolor="${NAVY}" style="background-color:${NAVY};background-image:linear-gradient(135deg,${NAVY} 0%,${NAVY_2} 55%,#1e3a8a 100%);padding:34px 36px 30px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="44" height="44" bgcolor="${BRAND_BLUE}" style="width:44px;height:44px;background-color:${BRAND_BLUE};border-radius:12px;text-align:center;vertical-align:middle;">
                    <span style="font-size:22px;line-height:44px;color:${GOLD};">&#9878;</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;font-family:Georgia,'Times New Roman',serif;">Legal</span><span style="font-size:22px;font-weight:800;color:#60a5fa;letter-spacing:-0.02em;font-family:Georgia,'Times New Roman',serif;">Setu</span>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:#94a3b8;letter-spacing:0.01em;">
                Understand your rights. In your language.
              </p>
            </td>
          </tr>

          <!-- Gold rule -->
          <tr>
            <td height="4" bgcolor="${GOLD}" style="height:4px;line-height:4px;font-size:0;background-color:${GOLD};background-image:linear-gradient(90deg,${GOLD},#f5d78e,${GOLD});">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 30px 36px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f8fafc" style="padding:24px 36px 28px 36px;background-color:#f8fafc;border-top:1px solid ${BORDER};">
              <p style="margin:0 0 10px 0;font-size:12px;line-height:1.65;color:${MUTED};">
                This is an automated message from LegalSetu — please don't reply to it. If you didn't ask for this email, you can safely ignore it; nothing on your account will change.
              </p>
              <p style="margin:0 0 10px 0;font-size:12px;line-height:1.65;color:${MUTED};">
                Need free legal help? Call the <strong style="color:${INK};">NALSA legal aid helpline — 15100</strong>.
              </p>
              <p style="margin:0;font-size:11px;line-height:1.6;color:#94a3b8;">
                &copy; ${year} LegalSetu &middot; General legal information, not legal advice.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** One cell per digit, with a spaced copy for screen readers and copy-paste. */
function codeBox(code: string): string {
  const spaced = code.split("").join(" ");
  const cells = code
    .split("")
    .map(
      (digit) => `
          <td style="padding:0 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td width="46" height="58" bgcolor="#ffffff" style="width:46px;height:58px;background-color:#ffffff;border:2px solid #bfdbfe;border-radius:12px;text-align:center;vertical-align:middle;">
                  <span style="font-size:30px;font-weight:800;color:${INK};font-family:${MONO};line-height:58px;">${escapeHtml(digit)}</span>
                </td>
              </tr>
            </table>
          </td>`
    )
    .join("");

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BLUE_SOFT}" style="background-color:${BLUE_SOFT};border-radius:16px;">
  <tr>
    <td align="center" style="padding:24px 12px 10px 12px;">
      <p style="margin:0 0 14px 0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_BLUE};">Your one-time code</p>
      <table role="presentation" cellpadding="0" cellspacing="0" aria-label="${escapeHtml(spaced)}">
        <tr>${cells}
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:6px 12px 22px 12px;">
      <span style="font-size:12px;color:${MUTED};font-family:${MONO};letter-spacing:2px;">${escapeHtml(spaced)}</span>
    </td>
  </tr>
</table>`;
}

function expiryPill(expiryMinutes: number): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#f1f5f9" style="background-color:#f1f5f9;border-radius:999px;padding:8px 16px;">
            <span style="font-size:12.5px;font-weight:600;color:${NAVY_2};">&#9201;&nbsp; Expires in ${expiryMinutes} minutes &middot; single use</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function securityNote(): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px;border-top:1px solid ${BORDER};">
  <tr>
    <td style="padding-top:18px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td width="28" style="vertical-align:top;font-size:16px;line-height:1.4;">&#128274;</td>
          <td style="font-size:12.5px;line-height:1.65;color:${MUTED};">
            <strong style="color:${INK};">Keep this code private.</strong> LegalSetu will never ask you for it by phone, WhatsApp, SMS or email. Anyone who asks is not from LegalSetu.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export interface OtpEmailInput {
  name?: string;
  code: string;
  /** Minutes until the code stops working. */
  expiryMinutes: number;
}

export function buildVerificationEmail({ name, code, expiryMinutes }: OtpEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
  const spaced = code.split("").join(" ");

  const html = layout({
    preheader: `Your LegalSetu verification code is ${spaced} — valid for ${expiryMinutes} minutes.`,
    bodyHtml: `
    <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_BLUE};">Account verification</p>
    <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;font-weight:800;color:${INK};letter-spacing:-0.01em;">Confirm your email address</h1>
    <p style="margin:0 0 26px 0;font-size:15px;line-height:1.65;color:#475569;">${greeting} welcome to LegalSetu. Enter the code below on the sign-up page to finish creating your account.</p>
    ${codeBox(code)}
    ${expiryPill(expiryMinutes)}
    ${securityNote()}
    <p style="margin:18px 0 0 0;font-size:12.5px;line-height:1.65;color:${MUTED};">
      If you didn't try to create a LegalSetu account, you can ignore this email.
    </p>
  `,
  });

  const text = `${firstName ? `Hi ${firstName},` : "Hi,"}\n\nYour LegalSetu verification code is: ${code}\n\nThis code expires in ${expiryMinutes} minutes and can only be used once.\n\nLegalSetu will never ask you for this code by phone, WhatsApp, SMS or email.\n\nIf you didn't try to create a LegalSetu account, you can ignore this email.\n\n— LegalSetu`;

  return { subject: `${code} is your LegalSetu verification code`, html, text };
}

export function buildPasswordResetEmail({ name, code, expiryMinutes }: OtpEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
  const spaced = code.split("").join(" ");

  const html = layout({
    preheader: `Your LegalSetu password reset code is ${spaced} — valid for ${expiryMinutes} minutes.`,
    bodyHtml: `
    <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#b45309;">Password reset</p>
    <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;font-weight:800;color:${INK};letter-spacing:-0.01em;">Reset your password</h1>
    <p style="margin:0 0 26px 0;font-size:15px;line-height:1.65;color:#475569;">${greeting} we received a request to reset the password on your LegalSetu account. Use this code to choose a new one.</p>
    ${codeBox(code)}
    ${expiryPill(expiryMinutes)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr>
        <td bgcolor="#fffbeb" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;line-height:1.65;color:#92400e;">
            <strong>Didn't request this?</strong> If you didn't request a password reset, ignore this email — your password stays the same. Consider changing it if you keep receiving these.
          </p>
        </td>
      </tr>
    </table>
    ${securityNote()}
  `,
  });

  const text = `${firstName ? `Hi ${firstName},` : "Hi,"}\n\nYour LegalSetu password reset code is: ${code}\n\nThis code expires in ${expiryMinutes} minutes and can only be used once.\n\nIf you didn't request this, you can ignore this email — your password stays the same.\n\n— LegalSetu`;

  return { subject: `${code} is your LegalSetu password reset code`, html, text };
}
