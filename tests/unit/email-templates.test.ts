import { describe, it, expect } from "vitest";
import { buildVerificationEmail, buildPasswordResetEmail } from "@/lib/email/templates";

describe("branded email templates", () => {
  it("verification email carries the code and expiry, and is HTML-safe", () => {
    const { subject, html, text } = buildVerificationEmail({
      name: "Shivam Sharma",
      code: "482913",
      expiryMinutes: 10,
    });

    expect(subject).toContain("482913");
    expect(html).toContain("4 8 2 9 1 3"); // spaced for readability in the code box
    expect(html).toContain("Shivam");
    expect(html).toContain("LegalSetu");
    expect(html).toContain("10 minutes");
    expect(text).toContain("482913");
    // Never claims to be an official document / overstates certainty.
    expect(html.toLowerCase()).not.toContain("guarantee");
  });

  it("password reset email includes a security notice", () => {
    const { html } = buildPasswordResetEmail({ code: "111222", expiryMinutes: 10 });
    expect(html.toLowerCase()).toContain("didn't request");
  });

  it("escapes a name containing HTML rather than injecting it", () => {
    const { html } = buildVerificationEmail({
      name: "<script>alert(1)</script>",
      code: "123456",
      expiryMinutes: 10,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("falls back to a generic greeting when no name is given", () => {
    const { html } = buildVerificationEmail({ code: "123456", expiryMinutes: 10 });
    expect(html).toContain("Hi,");
  });

  it("produces valid-looking HTML document structure", () => {
    const { html } = buildVerificationEmail({ code: "123456", expiryMinutes: 10 });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("plain-text fallback never contains HTML tags", () => {
    const { text } = buildVerificationEmail({ name: "A & B", code: "123456", expiryMinutes: 10 });
    expect(text).not.toMatch(/<[a-z][\s\S]*>/i);
  });
});
