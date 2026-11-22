"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, MessagesSquare, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { label } from "@/lib/lawyers/constants";
import type { SerializedConsultation } from "@/lib/lawyers/consultations";
import { Avatar, StatusPill } from "./ui";

function when(iso: string | Date | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Row({ c }: { c: SerializedConsultation }) {
  const asLawyer = c.party === "LAWYER";
  const name = asLawyer ? c.client.name : c.lawyer.fullName;
  return (
    <Link
      href={`/dashboard/consultations/${c.id}`}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-brandBlue/50",
        c.unread > 0 || (asLawyer && c.status === "PENDING") ? "border-brandBlue/40" : "border-borderCustom"
      )}
    >
      <Avatar name={name} photoUrl={asLawyer ? null : c.lawyer.photoUrl} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-textPrimary">{name}</p>
          <StatusPill status={c.status} />
          {c.urgency === "URGENT" && <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">URGENT</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-textSecondary">
          {label.practiceArea(c.category)} · {c.summary}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[11px] text-textSecondary">{when(c.lastMessageAt ?? c.createdAt)}</span>
        {c.unread > 0 && (
          <span className="rounded-full bg-brandBlue px-1.5 py-0.5 text-[10px] font-bold text-white" aria-label={`${c.unread} unread`}>
            {c.unread}
          </span>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-textSecondary" aria-hidden />
    </Link>
  );
}

export function ConsultationList() {
  const [data, setData] = useState<{ asClient: SerializedConsultation[]; asLawyer: SerializedConsultation[] } | null>(null);
  const [tab, setTab] = useState<"client" | "lawyer">("client");
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/consultations")
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return setError(true);
        setData(j.data);
        // An advocate lands on their incoming requests.
        if (j.data.asLawyer.length > 0 && j.data.asClient.length === 0) setTab("lawyer");
      })
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-sm text-rose-700 dark:text-rose-400">Could not load consultations. Refresh to try again.</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl border border-borderCustom bg-card" aria-busy="true" />;

  const showTabs = data.asLawyer.length > 0;
  const list = tab === "lawyer" ? data.asLawyer : data.asClient;
  const pendingIncoming = data.asLawyer.filter((c) => c.status === "PENDING").length;

  return (
    <div className="space-y-4">
      {showTabs && (
        <div role="tablist" className="flex gap-1.5">
          {(
            [
              ["client", `My requests (${data.asClient.length})`],
              ["lawyer", `Client requests (${data.asLawyer.length})${pendingIncoming ? ` · ${pendingIncoming} new` : ""}`],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold",
                tab === k ? "border-brandBlue bg-brandBlue text-white" : "border-borderCustom bg-card text-textSecondary"
              )}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <div className="rounded-2xl border border-borderCustom bg-card p-10 text-center">
          <MessagesSquare className="mx-auto h-8 w-8 text-textSecondary opacity-50" aria-hidden />
          <p className="mt-3 text-sm font-medium text-textPrimary">{tab === "lawyer" ? "No client requests yet" : "No consultations yet"}</p>
          {tab === "client" && (
            <Link
              href="/dashboard/lawyers"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brandBlue px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Search className="h-3.5 w-3.5" aria-hidden /> Find a lawyer near you
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id}>
              <Row c={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
