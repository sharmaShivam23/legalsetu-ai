import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** Polls until the assertion passes (the translator is async). */
async function waitFor(check: () => void, timeoutMs = 3000) {
  const start = Date.now();
  for (;;) {
    try {
      check();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });
    }
  }
}

/**
 * Switching straight from one Indian language to another used to leave
 * the page in the FIRST one: the Hindi on screen was text the translator
 * itself wrote, so it was treated as already done. Hindi <-> English and
 * English -> anything worked; Hindi -> Tamil did not, until a reload.
 */

const DICTIONARY: Record<string, Record<string, string>> = {
  hi: { "File a complaint": "शिकायत दर्ज करें", "My cases": "मेरे मामले" },
  ta: { "File a complaint": "புகார் அளிக்கவும்", "My cases": "என் வழக்குகள்" },
};

const state = { language: "en" };

vi.mock("@/components/providers/LanguageProvider", () => ({
  useLanguage: () => ({
    language: state.language,
    translate: async (texts: string[]) => texts.map((t) => DICTIONARY[state.language]?.[t] ?? t),
  }),
}));

import { AutoTranslate } from "@/components/i18n/AutoTranslate";

function Page() {
  return (
    <div>
      <button>File a complaint</button>
      <h2>My cases</h2>
      <AutoTranslate />
    </div>
  );
}

const text = () => document.body.textContent ?? "";

describe("AutoTranslate language switching", () => {
  beforeEach(() => {
    state.language = "en";
    document.body.innerHTML = "";
  });

  it("goes English -> Hindi -> Tamil -> English without getting stuck", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const rerender = (el: React.ReactElement) => act(() => root.render(el));
    await rerender(<Page />);
    expect(text()).toContain("File a complaint");

    state.language = "hi";
    await rerender(<Page />);
    await waitFor(() => expect(text()).toContain("शिकायत दर्ज करें"));
    expect(text()).toContain("मेरे मामले");

    // The case that was broken.
    state.language = "ta";
    await rerender(<Page />);
    await waitFor(() => expect(text()).toContain("புகார் அளிக்கவும்"));
    expect(text()).toContain("என் வழக்குகள்");
    expect(text()).not.toContain("शिकायत");

    state.language = "en";
    await rerender(<Page />);
    await waitFor(() => expect(text()).toContain("File a complaint"));
    expect(text()).toContain("My cases");
    expect(text()).not.toContain("புகார்");
  });
});
