import { describe, it, expect, beforeEach } from "vitest";
import {
  collectTranslatable,
  applyTranslations,
  restoreOriginals,
  isSkipped,
} from "@/lib/i18n/dom";

/** Fake translator: uppercases, so translated text is obvious. */
function fakeTranslate(sources: string[]): string[] {
  return sources.map((s) => `«${s.toUpperCase()}»`);
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe("DOM translation primitives", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collects visible text but ignores markup and whitespace", () => {
    const root = mount(`
      <div>
        <h1>My Cases</h1>
        <p>Track your case status</p>
        <span>   </span>
        <span>42</span>
      </div>
    `);

    const found = collectTranslatable(root).texts.map((t) => t.source.trim());
    expect(found).toContain("My Cases");
    expect(found).toContain("Track your case status");
    // Whitespace-only and pure numbers carry no language.
    expect(found).not.toContain("42");
    expect(found.some((f) => f === "")).toBe(false);
  });

  it("translates text nodes in place", () => {
    const root = mount("<h1>My Cases</h1><p>File a complaint</p>");
    const collected = collectTranslatable(root);

    applyTranslations(collected, fakeTranslate(collected.texts.map((t) => t.source)));

    expect(root.querySelector("h1")!.textContent).toBe("«MY CASES»");
    expect(root.querySelector("p")!.textContent).toBe("«FILE A COMPLAINT»");
  });

  it("respects data-no-translate (AI answers, language names)", () => {
    const root = mount(`
      <div>
        <p>Translate me</p>
        <div data-no-translate><p>हिन्दी</p></div>
      </div>
    `);

    const collected = collectTranslatable(root);
    const sources = collected.texts.map((t) => t.source.trim());

    expect(sources).toContain("Translate me");
    expect(sources).not.toContain("हिन्दी");
  });

  it("never translates code, pre or textarea content", () => {
    const root = mount(`
      <div>
        <p>Real copy</p>
        <code>const x = 1</code>
        <pre>BNS 303</pre>
        <textarea>user typed this</textarea>
      </div>
    `);

    const sources = collectTranslatable(root).texts.map((t) => t.source.trim());
    expect(sources).toContain("Real copy");
    expect(sources).not.toContain("const x = 1");
    expect(sources).not.toContain("BNS 303");
    expect(sources).not.toContain("user typed this");
  });

  it("translates user-visible attributes", () => {
    const root = mount(
      `<input placeholder="Ask a legal question" aria-label="Question box" />`
    );

    const collected = collectTranslatable(root);
    const attrSources = collected.attrs.map((a) => a.source);
    expect(attrSources).toContain("Ask a legal question");
    expect(attrSources).toContain("Question box");

    const all = [
      ...collected.texts.map((t) => t.source),
      ...collected.attrs.map((a) => a.source),
    ];
    applyTranslations(collected, fakeTranslate(all));

    const input = root.querySelector("input")!;
    expect(input.getAttribute("placeholder")).toBe("«ASK A LEGAL QUESTION»");
    expect(input.getAttribute("aria-label")).toBe("«QUESTION BOX»");
  });

  it("does not re-translate already-translated text (no runaway loop)", () => {
    const root = mount("<h1>My Cases</h1>");

    const first = collectTranslatable(root);
    applyTranslations(first, fakeTranslate(first.texts.map((t) => t.source)));
    expect(root.textContent).toBe("«MY CASES»");

    // Second pass over the same DOM must find nothing new.
    const second = collectTranslatable(root);
    expect(second.texts).toHaveLength(0);
    expect(root.textContent).toBe("«MY CASES»");
  });

  it("picks up content React renders later", () => {
    const root = mount("<div id='list'></div>");

    const first = collectTranslatable(root);
    applyTranslations(first, fakeTranslate(first.texts.map((t) => t.source)));

    // Simulate backend data arriving after the first pass.
    root.querySelector("#list")!.innerHTML = "<p>Rent dispute</p>";

    const second = collectTranslatable(root);
    expect(second.texts.map((t) => t.source)).toContain("Rent dispute");

    applyTranslations(second, fakeTranslate(second.texts.map((t) => t.source)));
    expect(root.querySelector("p")!.textContent).toBe("«RENT DISPUTE»");
  });

  it("restores the original English without any network call", () => {
    const root = mount(
      `<h1>My Cases</h1><input placeholder="Ask a legal question" />`
    );

    const collected = collectTranslatable(root);
    const all = [
      ...collected.texts.map((t) => t.source),
      ...collected.attrs.map((a) => a.source),
    ];
    applyTranslations(collected, fakeTranslate(all));
    expect(root.querySelector("h1")!.textContent).toBe("«MY CASES»");

    restoreOriginals(root);

    expect(root.querySelector("h1")!.textContent).toBe("My Cases");
    expect(root.querySelector("input")!.getAttribute("placeholder")).toBe(
      "Ask a legal question"
    );
  });

  it("does not clobber content that changed after translation", () => {
    const root = mount("<h1>My Cases</h1>");
    const collected = collectTranslatable(root);

    // React re-renders with new text before our translation lands.
    root.querySelector("h1")!.textContent = "My Documents";

    applyTranslations(collected, fakeTranslate(["My Cases"]));

    // The newer text must survive — stale translations are dropped.
    expect(root.querySelector("h1")!.textContent).toBe("My Documents");
  });

  it("isSkipped honours translate=no and contenteditable", () => {
    const root = mount(`
      <div>
        <span id="a" translate="no">x</span>
        <div id="b" contenteditable="true"><span id="c">y</span></div>
        <span id="d">z</span>
      </div>
    `);

    expect(isSkipped(root.querySelector("#a")!)).toBe(true);
    expect(isSkipped(root.querySelector("#c")!)).toBe(true);
    expect(isSkipped(root.querySelector("#d")!)).toBe(false);
  });
});
