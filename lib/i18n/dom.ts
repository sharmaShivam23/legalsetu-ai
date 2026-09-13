// ==========================================================
// LegalSetu — DOM translation primitives
// ----------------------------------------------------------
// The pure, framework-free half of the automatic translator.
// Kept out of the React component so it can be unit tested
// against a real DOM (see tests/unit/dom-translate.test.ts).
//
// The bookkeeping here is what makes runtime translation safe:
// every node remembers the English it started with, and what
// we last wrote into it. That lets us tell OUR text apart from
// text React has just re-rendered, so we never translate a
// translation, and switching back to English needs no network.
// ==========================================================

import { isTranslatable } from "./glossary";

/** Never look inside these — their text is code, markup or user input. */
export const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "VAR",
  "TEXTAREA",
  "SVG",
  "CANVAS",
  "IFRAME",
  "MATH",
  "TEMPLATE",
]);

/** User-visible attributes worth translating. */
export const TRANSLATABLE_ATTRIBUTES = [
  "placeholder",
  "title",
  "alt",
  "aria-label",
] as const;

// Node -> the English source text we first saw.
const originals = new WeakMap<Node, string>();
// Node -> the translated text we last wrote.
const applied = new WeakMap<Node, string>();
// Element -> per-attribute { original, applied }.
const attrState = new WeakMap<
  Element,
  Record<string, { original: string; applied: string }>
>();

export interface TextTarget {
  node: Text;
  source: string;
}

export interface AttrTarget {
  element: Element;
  attribute: string;
  source: string;
}

export interface CollectResult {
  texts: TextTarget[];
  attrs: AttrTarget[];
}

/** True when this node sits inside something we must not touch. */
export function isSkipped(node: Node): boolean {
  let el: Element | null =
    node.nodeType === 1 ? (node as Element) : node.parentElement;

  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute("data-no-translate")) return true;
    if (el.getAttribute("translate") === "no") return true;
    if (el.getAttribute("contenteditable") === "true") return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Finds everything under `root` that still needs translating.
 * A node holding exactly what we last wrote is already done;
 * anything else is fresh content and gets re-recorded.
 */
export function collectTranslatable(root: Element | Document): CollectResult {
  const doc = "ownerDocument" in root && root.ownerDocument ? root.ownerDocument : (root as Document);
  const texts: TextTarget[] = [];
  const attrs: AttrTarget[] = [];

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const value = node.nodeValue ?? "";
      if (!isTranslatable(value)) return NodeFilter.FILTER_REJECT;
      if (isSkipped(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const value = node.nodeValue ?? "";

    if (applied.get(node) !== value) {
      originals.set(node, value);
      texts.push({ node, source: value });
    }
    current = walker.nextNode();
  }

  const elements: Element[] = [];
  if (root.nodeType === 1) elements.push(root as Element);
  elements.push(...Array.from(root.querySelectorAll("*")));

  for (const element of elements) {
    if (isSkipped(element)) continue;
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (!value || !isTranslatable(value)) continue;

      const state = attrState.get(element) ?? {};
      if (state[attribute]?.applied === value) continue;

      state[attribute] = { original: value, applied: "" };
      attrState.set(element, state);
      attrs.push({ element, attribute, source: value });
    }
  }

  return { texts, attrs };
}

/**
 * Writes translations into the DOM.
 * A node is only written if it still holds the exact text we
 * translated — otherwise React has replaced it since, and
 * overwriting would clobber newer content.
 */
export function applyTranslations(
  result: CollectResult,
  translations: string[]
): number {
  let written = 0;

  result.texts.forEach((target, index) => {
    const value = translations[index];
    if (typeof value !== "string" || !value || value === target.source) return;
    if (target.node.nodeValue !== target.source) return;

    target.node.nodeValue = value;
    applied.set(target.node, value);
    written++;
  });

  result.attrs.forEach((target, index) => {
    const value = translations[result.texts.length + index];
    if (typeof value !== "string" || !value || value === target.source) return;

    target.element.setAttribute(target.attribute, value);
    const state = attrState.get(target.element) ?? {};
    state[target.attribute] = { original: target.source, applied: value };
    attrState.set(target.element, state);
    written++;
  });

  return written;
}

/**
 * Puts every node back to the English it started with.
 * Only touches nodes still holding our translation, so newer
 * content rendered since is left alone.
 */
export function restoreOriginals(root: Element | Document): number {
  const doc = "ownerDocument" in root && root.ownerDocument ? root.ownerDocument : (root as Document);
  let restored = 0;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const original = originals.get(node);
    if (original !== undefined && applied.get(node) === node.nodeValue) {
      node.nodeValue = original;
      applied.delete(node);
      restored++;
    }
    current = walker.nextNode();
  }

  for (const element of Array.from(root.querySelectorAll("*"))) {
    const state = attrState.get(element);
    if (!state) continue;
    for (const [attribute, record] of Object.entries(state)) {
      if (record.original && element.getAttribute(attribute) === record.applied) {
        element.setAttribute(attribute, record.original);
        restored++;
      }
    }
    attrState.delete(element);
  }

  return restored;
}

/** Test seam — clears bookkeeping between test cases. */
export function __resetTranslationState(): void {
  // WeakMaps cannot be cleared; callers in tests use fresh nodes instead.
  // Kept as an explicit no-op so the intent is documented.
}
