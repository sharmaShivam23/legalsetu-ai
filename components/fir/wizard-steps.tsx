"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { INCIDENT_TYPES } from "@/lib/fir/types";
import type { FirWizardDataInput } from "@/lib/validation/fir-wizard-schema";
import { isoToLocalInput, localInputToIso } from "@/lib/fir/datetime";

const fieldLabel = "mb-2 block text-sm font-medium text-navy-900";
const helpText = "mt-1 text-xs text-slate-400";
const selectClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

// -------------------- Step 1: Incident Categorization --------------------
export function StepIncidentType() {
  const { register, formState: { errors } } = useFormContext<FirWizardDataInput>();
  return (
    <div>
      <label className={fieldLabel}>What kind of incident are you reporting?</label>
      <select className={selectClass} {...register("incidentType")}>
        <option value="">Select incident type</option>
        {INCIDENT_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      {errors.incidentType && (
        <p className="mt-1 text-xs text-rose-600">{errors.incidentType.message}</p>
      )}
      <p className={helpText}>This sets which statutory sections we'll suggest later.</p>
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
        <label className={fieldLabel}>Exact date & time of incident</label>
        <Input
          type="datetime-local"
          value={isoToLocalInput(incidentDateTime)}
          onChange={(e) => setValue("incidentDateTime", localInputToIso(e.target.value), { shouldDirty: true })}
        />
      </div>
      <div>
        <label className={fieldLabel}>When did you discover it? (if different)</label>
        <Input
          type="datetime-local"
          value={isoToLocalInput(discoveryDateTime)}
          onChange={(e) => setValue("discoveryDateTime", localInputToIso(e.target.value), { shouldDirty: true })}
        />
      </div>
      <div>
        <label className={fieldLabel}>Reason for delay in reporting (if any)</label>
        <Textarea rows={2} {...register("delayReason")} placeholder="Optional — helps establish timeline credibility" />
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
        <Textarea rows={2} {...register("address")} placeholder="Full address where it happened" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel}>District</label>
          <Input {...register("district")} />
        </div>
        <div>
          <label className={fieldLabel}>State</label>
          <Input {...register("state")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel}>Landmark</label>
          <Input {...register("landmark")} placeholder="Optional" />
        </div>
        <div>
          <label className={fieldLabel}>Pincode</label>
          <Input {...register("pincode")} placeholder="Optional" />
        </div>
      </div>
      <div>
        <label className={fieldLabel}>Preferred police station (if known)</label>
        <Input {...register("preferredPoliceStation")} placeholder="Optional" />
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
      <label className="flex items-center gap-2 text-sm text-navy-900">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          checked={!!unknown}
          onChange={(e) => setValue("accusedUnknown", e.target.checked, { shouldDirty: true })}
        />
        Accused is unknown
      </label>

      {!unknown && (
        <>
          <div>
            <label className={fieldLabel}>Known suspect name(s)</label>
            <Input {...register("accusedName")} />
          </div>
          <div>
            <label className={fieldLabel}>Physical description</label>
            <Textarea rows={2} {...register("accusedDescription")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Vehicle number</label>
              <Input {...register("vehicleNumber")} placeholder="Optional" />
            </div>
            <div>
              <label className={fieldLabel}>Contact / social handle</label>
              <Input {...register("accusedContact")} placeholder="Optional" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// -------------------- Step 5: Loss, Harm & Property Inventory --------------------
export function StepLossHarm() {
  const { register, control } = useFormContext<FirWizardDataInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "lossItems" });

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={fieldLabel + " mb-0"}>Itemized property / loss</label>
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ description: "", value: undefined })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add item
          </Button>
        </div>
        <div className="space-y-2">
          {fields.length === 0 && (
            <p className="text-xs text-slate-400">No items added yet.</p>
          )}
          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder="Item description"
                {...register(`lossItems.${idx}.description` as const)}
              />
              <Input
                className="w-32"
                type="number"
                placeholder="Value (₹)"
                {...register(`lossItems.${idx}.value` as const, { valueAsNumber: true })}
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600"
                aria-label="Remove item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={fieldLabel}>Transaction ID(s) (for cyber fraud)</label>
        <Input {...register("transactionIds")} placeholder="Optional" />
      </div>

      <div>
        <label className={fieldLabel}>Physical injury details</label>
        <Textarea rows={2} {...register("injuryDetails")} placeholder="Optional" />
      </div>
    </div>
  );
}

// -------------------- Step 6: Chronological Incident Narrative --------------------
export function StepNarrative() {
  const { register, watch } = useFormContext<FirWizardDataInput>();
  const narrative = watch("narrative") ?? "";
  const words = narrative.trim() ? narrative.trim().split(/\s+/).length : 0;

  return (
    <div>
      <label className={fieldLabel}>Describe exactly what happened</label>
      <Textarea rows={8} {...register("narrative")} placeholder="Write a detailed, chronological account. Minimum 100 words recommended." />
      <p className={helpText}>
        {words} word{words === 1 ? "" : "s"}{" "}
        {words < 100 && <span className="text-amber-600">— aim for at least 100 for a complete draft</span>}
      </p>
    </div>
  );
}

// -------------------- Step 7: Witness Information & Evidence --------------------
export function StepWitnesses() {
  const { register, control } = useFormContext<FirWizardDataInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "witnesses" });

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={fieldLabel + " mb-0"}>Witnesses</label>
          <Button type="button" variant="outline" onClick={() => append({ name: "", contact: "" })}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add witness
          </Button>
        </div>
        <div className="space-y-2">
          {fields.length === 0 && <p className="text-xs text-slate-400">No witnesses added yet.</p>}
          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input className="flex-1" placeholder="Name" {...register(`witnesses.${idx}.name` as const)} />
              <Input className="flex-1" placeholder="Contact (optional)" {...register(`witnesses.${idx}.contact` as const)} />
              <button
                type="button"
                onClick={() => remove(idx)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600"
                aria-label="Remove witness"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={fieldLabel}>Evidence references</label>
        <Textarea rows={3} {...register("evidenceRefs")} placeholder="Photos, receipts, CCTV clips, file names, etc." />
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
    ["Narrative", data.narrative ? `${data.narrative.slice(0, 140)}${data.narrative.length > 140 ? "…" : ""}` : undefined],
    ["Witnesses", data.witnesses?.map((w) => w.name).filter(Boolean).join(", ")],
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
        {rows.map(([label, value]) =>
          value ? (
            <p key={label} className="mb-1">
              <span className="font-medium text-navy-900">{label}: </span>
              {value}
            </p>
          ) : null
        )}
      </div>
      <label className="flex items-start gap-2 text-sm text-navy-900">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          {...register("confirmed")}
        />
        I confirm the details above are accurate to the best of my knowledge.
      </label>
    </div>
  );
}
