export const siteConfig = {
  name: "LegalSetu",
  description:
    "AI-Powered Multilingual Legal Assistance Platform for Indian citizens.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  demoMode: process.env.AI_PROVIDER === "mock" || !process.env.AI_PROVIDER,
};
