"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Trash2,
  Wallet,
  Laptop,
  ShieldAlert,
  Hammer,
  Home,
  HandCoins,
  HelpCircle,
  Check,
} from "lucide-react";
import { INCIDENT_TYPES, type IncidentType } from "@/lib/fir/types";
import type { FirWizardDataInput } from "@/lib/validation/fir-wizard-schema";
import { isoToLocalInput, localInputToIso } from "@/lib/fir/datetime";

const fieldLabel = "mb-2 block text-sm font-semibold text-textPrimary";
const helpText = "mt-1.5 text-xs text-textSecondary leading-relaxed";
const inputClass =
  "border-borderCustom bg-canvas text-textPrimary placeholder:text-textSecondary focus-visible:ring-brandBlue";
const addButtonClass =
  "flex items-center gap-1.5 rounded-lg border border-borderCustom bg-canvas px-3 py-1.5 text-xs font-semibold text-textPrimary transition-colors hover:border-brandBlue/40 hover:text-brandBlue";
const removeButtonClass =
  "rounded-lg p-2 text-textSecondary transition-colors hover:bg-canvas hover:text-rose-500";

// -------------------- Step 1: Incident Categorization --------------------

/** One icon per incident type — the single change that does the most
 *  to make this step feel considered rather than a bare <select>. */
const INCIDENT_ICONS: Record<IncidentType, typeof Wallet> = {
  Theft: Wallet,
  "Cybercrime / Fraud": Laptop,
  "Physical Assault": ShieldAlert,
  "Property Damage": Hammer,
  "Domestic Violence": Home,
  Extortion: HandCoins,
  Other: HelpCircle,
};

export function StepIncidentType() {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<FirWizardDataInput>();
  const selected = watch("incidentType");

  return (
    <div className="space-y-1.5">
      <label className={fieldLabel}>What kind of incident are you reporting?</label>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {INCIDENT_TYPES.map((type) => {
          const Icon = INCIDENT_ICONS[type];
          const active = selected === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setValue("incidentType", type, { shouldDirty: true, shouldValidate: true })}
              className={
                "relative flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-center transition-all " +
                (active
                  ? "border-brandBlue bg-brandBlue/10 shadow-sm"
                  : "border-borderCustom bg-canvas hover:border-brandBlue/40")
              }
            >
              {active && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brandBlue text-white">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
              <Icon className={"h-5 w-5 " + (active ? "text-brandBlue" : "text-textSecondary")} />
              <span className={"text-xs font-medium leading-tight " + (active ? "text-brandBlue" : "text-textPrimary")}>
                {type}
              </span>
            </button>
          );
        })}
      </div>
      {errors.incidentType && (
        <p className="mt-1 text-xs text-rose-500">{errors.incidentType.message}</p>
      )}
      <p className={helpText}>This sets which statutory sections we&apos;ll suggest later.</p>
    </div>
  );
}

// -------------------- Step 2: Temporal Details --------------------
export function StepDateTime() {
  const { register, watch, setValue } = useFormContext<FirWizardDataInput>();
  const incidentDateTime = watch("incidentDateTime");
  const discoveryDateTime = watch("discoveryDateTime");

  return (
    <div className="space-y-4">
      <div>
        <label className={fieldLabel}>Exact date &amp; time of incident</label>
        <Input
          type="datetime-local"
          className={inputClass}
          value={isoToLocalInput(incidentDateTime)}
          onChange={(e) => setValue("incidentDateTime", localInputToIso(e.target.value), { shouldDirty: true })}
        />
      </div>
      <div>
        <label className={fieldLabel}>When did you discover it? (if different)</label>
        <Input
          type="datetime-local"
          className={inputClass}
          value={isoToLocalInput(discoveryDateTime)}
          onChange={(e) => setValue("discoveryDateTime", localInputToIso(e.target.value), { shouldDirty: true })}
        />
      </div>
      <div>
        <label className={fieldLabel}>Reason for delay in reporting (if any)</label>
        <Textarea
          rows={2}
          className={inputClass}
          {...register("delayReason")}
          placeholder="Optional — helps establish timeline credibility"
        />
      </div>
    </div>
  );
}

// -------------------- Step 3: Location & Jurisdiction --------------------
export function StepLocation() {
  const { register } = useFormContext<FirWizardDataInput>();
  return (
    <div className="space-y-4">
      <div>
        <label className={fieldLabel}>Incident site address</label>
        <Textarea
          rows={2}
          className={inputClass}
          {...register("address")}
          placeholder="Full address where it happened"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel}>District</label>
          <Input className={inputClass} {...register("district")} />
        </div>
        <div>
          <label className={fieldLabel}>State</label>
          <Input className={inputClass} {...register("state")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel}>Landmark</label>
          <Input className={inputClass} {...register("landmark")} placeholder="Optional" />
        </div>
        <div>
          <label className={fieldLabel}>Pincode</label>
          <Input className={inputClass} {...register("pincode")} placeholder="Optional" />
        </div>
      </div>
      <div>
        <label className={fieldLabel}>Preferred police station (if known)</label>
        <Input className={inputClass} {...register("preferredPoliceStation")} placeholder="Optional" />
      </div>
    </div>
  );
}

// -------------------- Step 4: Accused / Suspect Details --------------------
export function StepAccused() {
  const { register, watch, setValue } = useFormContext<FirWizardDataInput>();
  const unknown = watch("accusedUnknown");

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer select-none items-center gap-2.5 rounded-xl border border-borderCustom bg-canvas px-3.5 py-3 text-sm font-medium text-textPrimary">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-borderCustom text-brandBlue focus:ring-brandBlue"
          checked={!!unknown}
          onChange={(e) => setValue("accusedUnknown", e.target.checked, { shouldDirty: true })}
        />
        The accused is unknown to me
      </label>

      {!unknown && (
        <div className="space-y-4 pt-1">
          <div>
            <label className={fieldLabel}>Known suspect name(s)</label>
            <Input className={inputClass} {...register("accusedName")} />
          </div>
          <div>
            <label className={fieldLabel}>Physical description</label>
            <Textarea rows={2} className={inputClass} {...register("accusedDescription")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Vehicle number</label>
              <Input className={inputClass} {...register("vehicleNumber")} placeholder="Optional" />
            </div>
            <div>
              <label className={fieldLabel}>Contact / social handle</label>
              <Input className={inputClass} {...register("accusedContact")} placeholder="Optional" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------- Step 5: Loss, Harm & Property Inventory --------------------
export function StepLossHarm() {
  const { register, control } = useFormContext<FirWizardDataInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "lossItems" });

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={fieldLabel + " mb-0"}>Itemized property / loss</label>
          <button type="button" onClick={() => append({ description: "", value: undefined })} className={addButtonClass}>
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
        </div>
        <div className="space-y-2">
          {fields.length === 0 && (
            <p className="rounded-xl border border-dashed border-borderCustom px-3 py-3 text-center text-xs text-textSecondary">
              No items added yet.
            </p>
          )}
          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2 rounded-xl border border-borderCustom bg-canvas p-2">
              <Input
                className={`flex-1 border-0 bg-transparent ${inputClass}`}
                placeholder="Item description"
                {...register(`lossItems.${idx}.description` as const)}
              />
              <Input
                className={`w-28 border-0 bg-transparent ${inputClass}`}
                type="number"
                placeholder="Value (₹)"
                {...register(`lossItems.${idx}.value` as const, { valueAsNumber: true })}
              />
              <button type="button" onClick={() => remove(idx)} className={removeButtonClass} aria-label="Remove item">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={fieldLabel}>Transaction ID(s) (for cyber fraud)</label>
        <Input className={inputClass} {...register("transactionIds")} placeholder="Optional" />
      </div>

      <div>
        <label className={fieldLabel}>Physical injury details</label>
        <Textarea rows={2} className={inputClass} {...register("injuryDetails")} placeholder="Optional" />
      </div>
    </div>
  );
}

// -------------------- Step 6: Chronological Incident Narrative --------------------
export function StepNarrative() {
  const { register, watch } = useFormContext<FirWizardDataInput>();
  const narrative = watch("narrative") ?? "";
  const words = narrative.trim() ? narrative.trim().split(/\s+/).length : 0;
  const progress = Math.min(100, Math.round((words / 100) * 100));

  return (
    <div className="space-y-2">
      <label className={fieldLabel}>Describe exactly what happened</label>
      <Textarea
        rows={8}
        className={`${inputClass} leading-relaxed`}
        {...register("narrative")}
        placeholder="Write a detailed, chronological account. Minimum 100 words recommended."
      />
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-borderCustom">
          <div
            className={"h-full rounded-full transition-all duration-300 " + (words >= 100 ? "bg-emerald-500" : "bg-amber-500")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-textSecondary">
          {words} word{words === 1 ? "" : "s"}
        </span>
      </div>
      {words < 100 && (
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
          Aim for at least 100 words for a complete draft.
        </p>
      )}
    </div>
  );
}

// -------------------- Step 7: Witness Information & Evidence --------------------
export function StepWitnesses() {
  const { register, control } = useFormContext<FirWizardDataInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "witnesses" });

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={fieldLabel + " mb-0"}>Witnesses</label>
          <button type="button" onClick={() => append({ name: "", contact: "" })} className={addButtonClass}>
            <Plus className="h-3.5 w-3.5" />
            Add witness
          </button>
        </div>
        <div className="space-y-2">
          {fields.length === 0 && (
            <p className="rounded-xl border border-dashed border-borderCustom px-3 py-3 text-center text-xs text-textSecondary">
              No witnesses added yet.
            </p>
          )}
          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2 rounded-xl border border-borderCustom bg-canvas p-2">
              <Input
                className={`flex-1 border-0 bg-transparent ${inputClass}`}
                placeholder="Name"
                {...register(`witnesses.${idx}.name` as const)}
              />
              <Input
                className={`flex-1 border-0 bg-transparent ${inputClass}`}
                placeholder="Contact (optional)"
                {...register(`witnesses.${idx}.contact` as const)}
              />
              <button type="button" onClick={() => remove(idx)} className={removeButtonClass} aria-label="Remove witness">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={fieldLabel}>Evidence references</label>
        <Textarea
          rows={3}
          className={inputClass}
          {...register("evidenceRefs")}
          placeholder="Photos, receipts, CCTV clips, file names, etc."
        />
      </div>
    </div>
  );
}

// -------------------- Step 8: Final Review --------------------
export function StepReview() {
  const { watch, register } = useFormContext<FirWizardDataInput>();
  const data = watch();

  const rows: Array<[string, string | undefined]> = [
    ["Incident type", data.incidentType],
    ["Date/time", data.incidentDateTime ? new Date(data.incidentDateTime).toLocaleString("en-IN") : undefined],
    ["Location", [data.address, data.district, data.state].filter(Boolean).join(", ")],
    ["Accused", data.accusedUnknown ? "Unknown" : data.accusedName],
    [
      "Narrative",
      data.narrative ? `${data.narrative.slice(0, 140)}${data.narrative.length > 140 ? "…" : ""}` : undefined,
    ],
    ["Witnesses", data.witnesses?.map((w) => w.name).filter(Boolean).join(", ")],
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2.5 rounded-xl border border-borderCustom bg-canvas p-4 text-xs">
        {rows.map(([label, value]) =>
          value ? (
            <p key={label} className="leading-relaxed">
              <span className="font-semibold text-textPrimary">{label}: </span>
              <span className="text-textSecondary" data-no-translate>{value}</span>
            </p>
          ) : null
        )}
      </div>
      <label className="flex cursor-pointer select-none items-start gap-2.5 rounded-xl border border-borderCustom bg-canvas px-3.5 py-3 text-xs font-medium text-textPrimary">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-borderCustom text-brandBlue focus:ring-brandBlue"
          {...register("confirmed")}
        />
        <span>I confirm the details above are accurate to the best of my knowledge.</span>
      </label>
    </div>
  );
}
