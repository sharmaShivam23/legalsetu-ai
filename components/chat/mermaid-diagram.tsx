"use client";

// ==========================================================
// LegalSetu — Flowchart rendering (Mermaid)
// ----------------------------------------------------------
// This is what turns a "## Step-by-step plan" table into a
// visual flow the user can follow at a glance.
//
// Three things this has to survive:
//
//  1. STREAMING. While tokens are still arriving the fenced
//     block is half-written ("flowchart TD\n S([Sta"), which
//     is invalid by definition. Mermaid injects its own red
//     "Syntax error in text" bomb graphic straight into the
//     DOM when that happens, so the fix is both to refuse to
//     render until the message is complete (the caller passes
//     `enabled`) AND to turn that injection off outright.
//
//  2. IMPERFECT MODEL OUTPUT. The diagram is generated text,
//     so it can be malformed. Every diagram is validated with
//     mermaid.parse() BEFORE render() is allowed near the DOM,
//     and anything that fails degrades to the plain step list.
//
//  3. BEING USEFUL OFFLINE. People take these to a police
//     station or a legal-aid desk, so the diagram can be
//     downloaded as SVG or PNG.
// ==========================================================

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { GitBranch, AlertTriangle, Download, Loader2 } from "lucide-react";
import { repairMermaid } from "@/lib/rag/mermaid-repair";

// Loaded lazily, once, and reused — mermaid's init is not free
// and every diagram on the page shares one parser instance.
let mermaidModulePromise: Promise<typeof import("mermaid")> | null = null;
function loadMermaid() {
  if (!mermaidModulePromise) mermaidModulePromise = import("mermaid");
  return mermaidModulePromise;
}

/** LegalSetu palette — calm, legible, and consistent in both themes. */
function themeVariablesFor(dark: boolean) {
  return dark
    ? {
        primaryColor: "#1e3a5f",
        primaryTextColor: "#e2e8f0",
        primaryBorderColor: "#3b82f6",
        lineColor: "#64748b",
        secondaryColor: "#134e4a",
        tertiaryColor: "#3f2d1a",
        fontSize: "14px",
      }
    : {
        primaryColor: "#e0edff",
        primaryTextColor: "#0f172a",
        primaryBorderColor: "#2563eb",
        lineColor: "#64748b",
        secondaryColor: "#d1fae5",
        tertiaryColor: "#fef3c7",
        fontSize: "14px",
      };
}

export function MermaidDiagram({
  code,
  /** False while the answer is still streaming — the fence is
   *  incomplete until the message finishes, and rendering it
   *  early is what produced Mermaid's error graphics. */
  enabled = true,
}: {
  code: string;
  enabled?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svgRef = useRef<string | null>(null);
  svgRef.current = svg;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setFailed(false);
    setSvg(null);

    (async () => {
      try {
        const mermaid = (await loadMermaid()).default;
        const dark = resolvedTheme === "dark";

        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: themeVariablesFor(dark),
          securityLevel: "strict",
          fontFamily: "inherit",
          flowchart: { curve: "basis", padding: 16, useMaxWidth: true },
          // Without this, a malformed diagram is drawn as Mermaid's own
          // red bomb graphic instead of throwing — which is exactly the
          // error the user was seeing stacked down the page.
          suppressErrorRendering: true,
        });

        let source = code.trim();

        // Validate before letting render() anywhere near the DOM. If the
        // model's diagram doesn't parse, try once more with labels quoted
        // (see lib/rag/mermaid-repair.ts) — the usual breakage is just a
        // bracket or colon inside a node's text, and the plan itself is
        // perfectly good.
        let valid = Boolean(await mermaid.parse(source, { suppressErrors: true }));
        if (!valid) {
          const repaired = repairMermaid(source);
          if (repaired !== source && (await mermaid.parse(repaired, { suppressErrors: true }))) {
            source = repaired;
            valid = true;
          }
        }
        if (!valid) {
          if (!cancelled) setFailed(true);
          return;
        }

        const { svg: rendered } = await mermaid.render(
          `ls-flow-${rawId}-${dark ? "d" : "l"}`,
          source
        );
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, resolvedTheme, rawId, enabled]);

  const download = useCallback(
    async (format: "svg" | "png") => {
      const current = svgRef.current;
      if (!current) return;

      if (format === "svg") {
        const blob = new Blob([current], { type: "image/svg+xml;charset=utf-8" });
        triggerDownload(URL.createObjectURL(blob), "legalsetu-action-plan.svg");
        return;
      }

      // PNG: paint the SVG onto a canvas at 2x for a crisp export.
      const blob = new Blob([current], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.crossOrigin = "anonymous";

      await new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = url;
      });

      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = (image.width || 800) * scale;
      canvas.height = (image.height || 600) * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // A transparent PNG is unusable on a printed page.
        ctx.fillStyle = resolvedTheme === "dark" ? "#0f172a" : "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        triggerDownload(canvas.toDataURL("image/png"), "legalsetu-action-plan.png");
      }
      URL.revokeObjectURL(url);
    },
    [resolvedTheme]
  );

  // Still streaming — show a calm placeholder rather than trying to
  // draw a diagram that is, by definition, only half written.
  if (!enabled) {
    return (
      <div className="my-4 flex items-center gap-2 rounded-xl border border-borderCustom bg-canvas p-4 text-xs text-textSecondary">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-brandBlue" />
        Preparing your action flowchart…
      </div>
    );
  }

  if (failed) {
    return (
      <div className="my-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold">
            Flowchart unavailable — your steps are listed in the plan above.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="my-4 rounded-xl border border-borderCustom bg-canvas p-4"
      data-no-translate
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-textSecondary">
          <GitBranch className="h-3.5 w-3.5 text-brandBlue" />
          Your action plan
        </div>

        {svg && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void download("png")}
              title="Download as PNG image"
              className="flex items-center gap-1 rounded-lg border border-borderCustom px-2 py-1 text-[10px] font-semibold text-textSecondary transition-colors hover:border-brandBlue/40 hover:text-brandBlue"
            >
              <Download className="h-3 w-3" />
              PNG
            </button>
            <button
              type="button"
              onClick={() => void download("svg")}
              title="Download as SVG (scales without blurring)"
              className="flex items-center gap-1 rounded-lg border border-borderCustom px-2 py-1 text-[10px] font-semibold text-textSecondary transition-colors hover:border-brandBlue/40 hover:text-brandBlue"
            >
              <Download className="h-3 w-3" />
              SVG
            </button>
          </div>
        )}
      </div>

      {svg ? (
        <div
          className="flex justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
          // Mermaid's own output, produced with securityLevel "strict",
          // which sanitises the SVG it generates.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex h-24 items-center justify-center gap-2 text-xs text-textSecondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Drawing the flowchart…
        </div>
      )}
    </div>
  );
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
