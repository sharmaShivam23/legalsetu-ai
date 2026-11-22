// ==========================================================
// Demo advocates and who operates them
// ----------------------------------------------------------
// The seeded demo advocates are FICTIONAL: no real person signs in as them,
// and their email addresses (…@legalsetu-demo.example) do not exist. A request
// sent to one would therefore reach nobody, and nobody could answer it.
//
// For demos, the people listed in DEMO_ADVOCATE_OPERATORS (comma-separated
// emails; defaults to ADMIN_EMAIL) — and any ADMIN account — act as the
// demo advocates: they receive the notification emails and can open,
// accept and reply to requests sent to a demo advocate.
//
// This applies ONLY to profiles marked isDemo. A real advocate's requests are
// never visible to an operator.
// ==========================================================

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** Operator email addresses (lower-case, de-duplicated). */
export function demoOperatorEmails(): string[] {
  const explicit = parseList(process.env.DEMO_ADVOCATE_OPERATORS);
  const list = explicit.length ? explicit : parseList(process.env.ADMIN_EMAIL);
  return Array.from(new Set(list));
}

export function isDemoOperator(user: { email: string; role: string }): boolean {
  return user.role === "ADMIN" || demoOperatorEmails().includes(user.email.trim().toLowerCase());
}

/**
 * Where a notification for an advocate should go. A real advocate gets it at
 * their own address; a demo advocate's mail goes to the operators instead
 * (falling back to the advocate's own address if none are configured).
 */
export function advocateMailTargets(profile: { isDemo: boolean }, advocateEmail: string): string[] {
  if (!profile.isDemo) return [advocateEmail];
  const operators = demoOperatorEmails();
  return operators.length ? operators : [advocateEmail];
}
