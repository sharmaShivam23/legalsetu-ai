"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Eye,
  ImagePlus,
  Loader2,
  LocateFixed,
  MapPin,
  Send,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  BAR_COUNCILS,
  COURTS,
  DOCUMENT_TYPES,
  GENDERS,
  LAWYER_LANGUAGES,
  PRACTICE_AREAS,
} from "@/lib/lawyers/constants";
import { checkEnrolment, normaliseEnrolment, promotionalProblems } from "@/lib/lawyers/validation";
import { LawyerMap } from "./map";
import { Avatar, StatusPill } from "./ui";
import { prepareFile, uploadFile } from "./upload";

interface Doc {
  id: string;
  type: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface OwnerProfile {
  id: string;
  fullName: string;
  gender: string | null;
  photoUrl: string | null;
  barCouncil: string;
  enrolmentNumber: string;
  enrolmentYear: number;
  aibeNumber: string | null;
  practiceAreas: string[];
  courts: string[];
  languages: string[];
  bio: string | null;
  officeAddress: string;
  city: string;
  pincode: string;
  latitude: number;
  longitude: number;
  legalAidPanel: boolean;
  proBono: boolean;
  acceptingClients: boolean;
  status: string;
  listed: boolean;
  verifiedAt: string | null;
  verificationExpiresOn: string | null;
  verificationExpired: boolean;
  rejectionReason: string | null;
  documents: Doc[];
  missing: string[];
}

type Form = {
  fullName: string;
  gender: string;
  barCouncil: string;
  enrolmentNumber: string;
  enrolmentYear: string;
  aibeNumber: string;
  practiceAreas: string[];
  courts: string[];
  languages: string[];
  bio: string;
  officeAddress: string;
  city: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  legalAidPanel: boolean;
  proBono: boolean;
  acceptingClients: boolean;
};

const EMPTY: Form = {
  fullName: "",
  gender: "",
  barCouncil: "",
  enrolmentNumber: "",
  enrolmentYear: "",
  aibeNumber: "",
  practiceAreas: [],
  courts: [],
  languages: [],
  bio: "",
  officeAddress: "",
  city: "",
  pincode: "",
  latitude: null,
  longitude: null,
  legalAidPanel: false,
  proBono: false,
  acceptingClients: true,
};

const fromProfile = (p: OwnerProfile): Form => ({
  fullName: p.fullName,
  gender: p.gender ?? "",
  barCouncil: p.barCouncil,
  enrolmentNumber: p.enrolmentNumber,
  enrolmentYear: String(p.enrolmentYear),
  aibeNumber: p.aibeNumber ?? "",
  practiceAreas: p.practiceAreas,
  courts: p.courts,
  languages: p.languages,
  bio: p.bio ?? "",
  officeAddress: p.officeAddress,
  city: p.city,
  pincode: p.pincode,
  latitude: p.latitude,
  longitude: p.longitude,
  legalAidPanel: p.legalAidPanel,
  proBono: p.proBono,
  acceptingClients: p.acceptingClients,
});

const inputCls =
  "mt-1 w-full rounded-xl border border-borderCustom bg-card px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-brandBlue focus:ring-2 focus:ring-brandBlue/20";

function Section({ step, title, done, children }: { step: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-borderCustom bg-card p-5 sm:p-6" aria-label={title}>
      <h2 className="flex items-center gap-2 text-sm font-bold text-textPrimary">
        {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> : <Circle className="h-5 w-5 text-textSecondary" aria-hidden />}
        <span className="text-textSecondary">Step {step}.</span> {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MultiToggle({ options, value, onChange, name }: { options: readonly { key: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; name: string }) {
  return (
    <div role="group" aria-label={name} className="mt-1.5 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.key) : [...value, o.key])}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              on ? "border-brandBlue bg-brandBlue text-white" : "border-borderCustom bg-card text-textSecondary hover:text-textPrimary"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_COPY: Record<string, { tone: string; text: string }> = {
  DRAFT: { tone: "border-borderCustom bg-canvas", text: "Complete the four steps below and submit. You appear in Find a Lawyer only after an admin verifies your Bar Council documents." },
  SUBMITTED: { tone: "border-amber-500/40 bg-amber-500/5", text: "Your documents are with our team for verification. We will email you when it is done." },
  VERIFIED: { tone: "border-emerald-500/40 bg-emerald-500/5", text: "You are verified and listed in Find a Lawyer." },
  REJECTED: { tone: "border-rose-500/40 bg-rose-500/5", text: "We could not verify your profile yet. Fix the issue below and submit again." },
  SUSPENDED: { tone: "border-rose-500/40 bg-rose-500/5", text: "Your profile is suspended and hidden from the directory. Contact LegalSetu support." },
};

export function AdvocateProfileForm() {
  const [role, setRole] = useState<string | null>(null);
  const [profile, setProfile] = useState<OwnerProfile | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await fetch("/api/lawyer/profile");
    const j = await r.json();
    if (!j.success) return setProfile(null);
    setRole(j.data.role);
    setProfile(j.data.profile);
    if (j.data.profile) setForm(fromProfile(j.data.profile));
  }
  useEffect(() => {
    void load();
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const promo = useMemo(() => promotionalProblems(form.bio), [form.bio]);
  const enrolmentError = useMemo(() => {
    if (!form.enrolmentNumber || !form.enrolmentYear) return null;
    return checkEnrolment(form.enrolmentNumber, Number(form.enrolmentYear));
  }, [form.enrolmentNumber, form.enrolmentYear]);
  const identityChanged =
    profile &&
    (profile.status === "VERIFIED" || profile.status === "SUBMITTED") &&
    (profile.fullName !== form.fullName.trim() ||
      profile.barCouncil !== form.barCouncil ||
      profile.enrolmentNumber !== normaliseEnrolment(form.enrolmentNumber) ||
      String(profile.enrolmentYear) !== form.enrolmentYear);

  async function locateFromPincode() {
    if (!/^[1-9]\d{5}$/.test(form.pincode)) return setMessage({ kind: "error", text: "Enter a valid 6-digit PIN code first." });
    setLocating(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/geocode?pincode=${form.pincode}`);
      const j = await r.json();
      if (!j.success) return setMessage({ kind: "error", text: j.error?.message ?? "PIN code not found." });
      setForm((f) => ({ ...f, latitude: j.data.point.latitude, longitude: j.data.point.longitude, city: f.city || j.data.point.label.split(",").pop()!.trim() }));
    } finally {
      setLocating(false);
    }
  }

  function locateFromGps() {
    if (!("geolocation" in navigator)) return setMessage({ kind: "error", text: "Your browser cannot share location." });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // The office location is public by design (a permitted detail), so
        // it is kept precise — but only ever set while at the office.
        setForm((f) => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
      },
      () => {
        setLocating(false);
        setMessage({ kind: "error", text: "Could not get your location. Use the PIN code or click the map." });
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.latitude === null || form.longitude === null) {
      return setMessage({ kind: "error", text: "Place your office on the map (PIN code, current location, or click the map)." });
    }
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch("/api/lawyer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          gender: form.gender || null,
          enrolmentYear: Number(form.enrolmentYear),
          aibeNumber: form.aibeNumber || null,
          bio: form.bio || null,
        }),
      });
      const j = await r.json();
      if (!j.success) return setMessage({ kind: "error", text: j.error?.message ?? "Could not save." });
      setProfile(j.data.profile);
      setForm(fromProfile(j.data.profile));
      setMessage({
        kind: "ok",
        text: j.data.sentBackForReview ? "Saved. Because your identity details changed, your profile is back under review." : "Profile saved.",
      });
    } catch {
      setMessage({ kind: "error", text: "Could not reach the server. Check your connection." });
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: "photo" | string, file: File) {
    setUploading(kind);
    setMessage(null);
    try {
      if (kind === "photo") {
        await uploadFile("/api/lawyer/profile/photo", await prepareFile(file, 600));
      } else {
        await uploadFile("/api/lawyer/documents", await prepareFile(file, 2000), { type: kind });
      }
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    try {
      const r = await fetch("/api/lawyer/profile/submit", { method: "POST" });
      const j = await r.json();
      if (!j.success) return setMessage({ kind: "error", text: j.error?.message ?? "Could not submit." });
      setProfile(j.data.profile);
      setMessage({ kind: "ok", text: "Submitted for verification. We will email you when it is reviewed." });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  if (profile === undefined) return <div className="h-64 animate-pulse rounded-2xl border border-borderCustom bg-card" aria-busy="true" />;
  if (role === "ADMIN" || role === "RESEARCHER") {
    return <p className="rounded-2xl border border-borderCustom bg-card p-6 text-sm text-textSecondary">Staff accounts cannot hold an advocate profile.</p>;
  }

  const docsByType = new Map((profile?.documents ?? []).map((d) => [d.type, d]));
  const detailsDone = Boolean(profile);
  const photoDone = Boolean(profile?.photoUrl);
  const docsDone = DOCUMENT_TYPES.every((d) => docsByType.has(d.key));
  const canSubmit =
    profile && profile.missing.length === 0 && (profile.status === "DRAFT" || profile.status === "REJECTED" || profile.verificationExpired);
  const locked = profile?.status === "SUSPENDED";
  const status = profile?.status ?? "DRAFT";

  return (
    <div className="space-y-5">
      <div className={cn("rounded-2xl border p-4", (STATUS_COPY[status] ?? STATUS_COPY.DRAFT).tone)} role="status">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brandBlue" aria-hidden />
          <p className="text-sm font-bold text-textPrimary">Verification status</p>
          <StatusPill status={profile?.verificationExpired ? "REJECTED" : status} />
        </div>
        <p className="mt-1.5 text-sm text-textPrimary">
          {profile?.verificationExpired
            ? "Your yearly verification has expired, so you are hidden from the directory. Check your documents are current and submit again."
            : (STATUS_COPY[status] ?? STATUS_COPY.DRAFT).text}
        </p>
        {profile?.status === "VERIFIED" && profile.verificationExpiresOn && !profile.verificationExpired && (
          <p className="mt-1 text-xs text-textSecondary">
            Valid until {new Date(profile.verificationExpiresOn).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.{" "}
            <Link href={`/dashboard/lawyers/${profile.id}`} className="font-semibold text-brandBlue">
              See your public profile
            </Link>
          </p>
        )}
        {profile?.rejectionReason && <p className="mt-2 text-sm font-semibold text-rose-700 dark:text-rose-400">Reviewer&apos;s note: {profile.rejectionReason}</p>}
      </div>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            message.kind === "error" ? "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-400" : "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
          )}
        >
          {message.text}
        </p>
      )}

      <Section step={1} title="Your details" done={detailsDone}>
        <form onSubmit={save} className="space-y-5" noValidate>
          <fieldset disabled={locked} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-textSecondary sm:col-span-2">
                Full name exactly as on your enrolment certificate *
                <input className={inputCls} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} maxLength={120} />
              </label>
              <label className="text-xs font-semibold text-textSecondary">
                State Bar Council *
                <select className={inputCls} value={form.barCouncil} onChange={(e) => set("barCouncil", e.target.value)}>
                  <option value="">Choose…</option>
                  {BAR_COUNCILS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-textSecondary">
                Gender (optional — some clients, e.g. in domestic-violence cases, ask for a woman advocate)
                <select className={inputCls} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                  <option value="">Prefer not to say</option>
                  {GENDERS.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-textSecondary">
                Enrolment number *
                <input
                  className={inputCls}
                  value={form.enrolmentNumber}
                  onChange={(e) => set("enrolmentNumber", e.target.value)}
                  placeholder="e.g. D/1234/2015"
                  maxLength={40}
                  aria-invalid={Boolean(enrolmentError)}
                />
                {enrolmentError && <span className="mt-1 block font-normal text-rose-700 dark:text-rose-400">{enrolmentError}</span>}
              </label>
              <label className="text-xs font-semibold text-textSecondary">
                Year of enrolment *
                <input
                  className={inputCls}
                  value={form.enrolmentYear}
                  onChange={(e) => set("enrolmentYear", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="2015"
                />
              </label>
              <label className="text-xs font-semibold text-textSecondary">
                AIBE certificate number (if enrolled after 2010)
                <input className={inputCls} value={form.aibeNumber} onChange={(e) => set("aibeNumber", e.target.value)} maxLength={40} />
              </label>
            </div>
            {identityChanged && (
              <p className="flex items-start gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-textPrimary">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                Changing your name, Bar Council or enrolment number sends your profile back for verification. You will be hidden from the
                directory until it is reviewed.
              </p>
            )}

            <div>
              <p className="text-xs font-semibold text-textSecondary">Practice areas *</p>
              <MultiToggle name="Practice areas" options={PRACTICE_AREAS} value={form.practiceAreas} onChange={(v) => set("practiceAreas", v)} />
            </div>
            <div>
              <p className="text-xs font-semibold text-textSecondary">Courts you appear in *</p>
              <MultiToggle name="Courts" options={COURTS} value={form.courts} onChange={(v) => set("courts", v)} />
            </div>
            <div>
              <p className="text-xs font-semibold text-textSecondary">Languages you can consult in *</p>
              <MultiToggle
                name="Languages"
                options={LAWYER_LANGUAGES.map((l) => ({ key: l.code, label: l.label }))}
                value={form.languages}
                onChange={(v) => set("languages", v)}
              />
            </div>

            <label className="block text-xs font-semibold text-textSecondary">
              Short factual note (optional, 300 characters)
              <textarea
                className={cn(inputCls, "min-h-[80px]")}
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
                maxLength={300}
                placeholder="e.g. Practising at Saket District Court since 2015, mainly bail and family matters."
                aria-invalid={promo.length > 0}
              />
              <span className="mt-1 flex justify-between font-normal">
                <span className={promo.length ? "text-rose-700 dark:text-rose-400" : ""}>
                  {promo.length
                    ? `Bar Council Rule 36 does not allow advertising. Remove: ${promo.join(", ")}.`
                    : "Facts only — no \"best\", success rates, fees, phone numbers or links (Bar Council Rule 36)."}
                </span>
                <span>{form.bio.length}/300</span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-textSecondary sm:col-span-2">
                Chamber / office address *
                <input
                  className={inputCls}
                  value={form.officeAddress}
                  onChange={(e) => set("officeAddress", e.target.value)}
                  placeholder="Chamber 412, Lawyers' Block, Saket District Court"
                  maxLength={300}
                />
              </label>
              <label className="text-xs font-semibold text-textSecondary">
                City *
                <input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={80} />
              </label>
              <label className="text-xs font-semibold text-textSecondary">
                PIN code *
                <div className="mt-1 flex gap-2">
                  <input
                    className={cn(inputCls, "mt-0")}
                    value={form.pincode}
                    onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={locateFromPincode}
                    disabled={locating}
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-borderCustom px-3 text-xs font-semibold text-textPrimary hover:bg-canvas disabled:opacity-50"
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> Find
                  </button>
                </div>
              </label>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-textSecondary">
                  Office location on the map * — click the map or drag the pin to the exact spot. Clients see this.
                </p>
                <button
                  type="button"
                  onClick={locateFromGps}
                  disabled={locating}
                  className="flex items-center gap-1 text-xs font-semibold text-brandBlue disabled:opacity-50"
                >
                  {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LocateFixed className="h-3.5 w-3.5" aria-hidden />}
                  I&apos;m at my office now
                </button>
              </div>
              <LawyerMap
                center={form.latitude !== null && form.longitude !== null ? [form.latitude, form.longitude] : [22.5, 79]}
                showCenter={false}
                height={280}
                pins={form.latitude !== null && form.longitude !== null ? [{ id: "office", latitude: form.latitude, longitude: form.longitude, title: "Your office" }] : []}
                onPick={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
                ariaLabel="Pick your office location"
              />
            </div>

            <div className="space-y-2 rounded-xl border border-borderCustom bg-canvas p-4">
              <label className="flex items-start gap-2 text-sm text-textPrimary">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brandBlue" checked={form.legalAidPanel} onChange={(e) => set("legalAidPanel", e.target.checked)} />
                <span>
                  I am on a District / State Legal Services Authority panel
                  <span className="block text-xs text-textSecondary">You will appear when citizens look for free legal aid.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-textPrimary">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brandBlue" checked={form.proBono} onChange={(e) => set("proBono", e.target.checked)} />
                I take some cases pro bono (free of charge)
              </label>
              <label className="flex items-start gap-2 text-sm text-textPrimary">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brandBlue" checked={form.acceptingClients} onChange={(e) => set("acceptingClients", e.target.checked)} />
                I am taking new consultation requests
              </label>
            </div>

            <button
              type="submit"
              disabled={saving || promo.length > 0}
              className="flex items-center gap-2 rounded-xl bg-brandBlue px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {profile ? "Save details" : "Save and continue"}
            </button>
          </fieldset>
        </form>
      </Section>

      <Section step={2} title="Profile photo" done={photoDone}>
        {!profile ? (
          <p className="text-sm text-textSecondary">Save your details first.</p>
        ) : (
          <div className="flex items-center gap-4">
            <Avatar name={profile.fullName} photoUrl={profile.photoUrl} size={72} />
            <div>
              <input
                ref={photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload("photo", f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading !== null || locked}
                onClick={() => photoInput.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-borderCustom px-4 py-2 text-sm font-semibold text-textPrimary hover:bg-canvas disabled:opacity-50"
              >
                {uploading === "photo" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
                {profile.photoUrl ? "Change photo" : "Upload photo"}
              </button>
              <p className="mt-1 text-xs text-textSecondary">A clear, recent photo of your face. Location data is removed from the file.</p>
            </div>
          </div>
        )}
      </Section>

      <Section step={3} title="Verification documents" done={docsDone}>
        {!profile ? (
          <p className="text-sm text-textSecondary">Save your details first.</p>
        ) : (
          <>
            <p className="mb-3 text-xs leading-relaxed text-textSecondary">
              Seen only by LegalSetu&apos;s verification team, never by clients. PDF, JPG or PNG up to 5 MB. Do <strong>not</strong> upload
              a full Aadhaar card — LegalSetu never stores Aadhaar numbers.
            </p>
            <ul className="space-y-2">
              {DOCUMENT_TYPES.map((t) => {
                const doc = docsByType.get(t.key);
                return (
                  <li key={t.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-borderCustom p-3">
                    {doc ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-textSecondary" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-textPrimary">{t.label}</p>
                      <p className="text-xs text-textSecondary">{t.hint}</p>
                      {doc && (
                        <p className="mt-0.5 text-[11px] text-textSecondary">
                          Uploaded {new Date(doc.uploadedAt).toLocaleDateString("en-IN")} · {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB
                        </p>
                      )}
                    </div>
                    {doc && (
                      <a
                        href={`/api/lawyer/documents/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs font-semibold text-brandBlue"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden /> View
                      </a>
                    )}
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-xl border border-borderCustom px-3 py-1.5 text-xs font-semibold text-textPrimary hover:bg-canvas",
                        (uploading !== null || locked) && "pointer-events-none opacity-50"
                      )}
                    >
                      {uploading === t.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
                      {doc ? "Replace" : "Upload"}
                      <input
                        type="file"
                        className="sr-only"
                        accept={t.imagesOnly ? "image/jpeg,image/png,image/webp" : "application/pdf,image/jpeg,image/png,image/webp"}
                        capture={t.key === "SELFIE_WITH_ID" ? "user" : undefined}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void upload(t.key, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>

      <Section step={4} title="Submit for verification" done={status === "SUBMITTED" || (status === "VERIFIED" && !profile?.verificationExpired)}>
        {profile && profile.missing.length > 0 && (
          <p className="mb-3 text-xs text-textSecondary">Still needed: {profile.missing.map((m) => m.replace(/^\w+: /, "").replace(/_/g, " ").toLowerCase()).join(", ")}.</p>
        )}
        <p className="mb-3 text-xs leading-relaxed text-textSecondary">
          By submitting, you confirm the documents are genuine and yours. Impersonating an advocate is an offence under Section 45 of the
          Advocates Act, 1961. LegalSetu takes no fee or commission from advocates or clients.
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || submitting}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Submit for verification
        </button>
        {status === "VERIFIED" && !profile?.verificationExpired && (
          <Link href="/dashboard/advocate" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brandBlue">
            Go to your Client Desk <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </Section>
    </div>
  );
}
