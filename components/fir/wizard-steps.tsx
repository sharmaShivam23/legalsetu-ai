"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { INCIDENT_TYPES } from "@/lib/fir/types";
import type { FirWizardDataInput } from "@/lib/validation/fir-wizard-schema";
import { isoToLocalInput, localInputToIso } from "@/lib/fir/datetime";

const fieldLabel = "mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-100";
const helpText = "mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed";
const selectClass =
  "w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-xs";
const inputClass = 
  "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:ring-blue-500";

// -------------------- Step 1: Incident Categorization --------------------
export function StepIncidentType() {
  const { register, formState: { errors } } = useFormContext<FirWizardDataInput>();
  return (
    <div className="space-y-1.5">
      <label className={fieldLabel}>What kind of incident are you reporting?</label>
      <select className={selectClass} {...register("incidentType")}>
        <option value="" className="bg-white dark:bg-slate-900">Select incident type</option>
        {INCIDENT_TYPES.map((t) => (
          <option key={t} value={t} className="bg-white dark:bg-slate-900">{t}</option>
        ))}
      </select>
      {errors.incidentType && (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.incidentType.message}</p>
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
      <label className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100 cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-900"
          checked={!!unknown}
          onChange={(e) => setValue("accusedUnknown", e.target.checked, { shouldDirty: true })}
        />
        Accused is unknown
      </label>

      {!unknown && (
        <div className="space-y-4 pt-1">
          <div>
            <label className={fieldLabel}>Known suspect name(s)</label>
            <Input className={inputClass} {...register("accusedName")} />
          </div>
          <div>
            <label className={fieldLabel}>Physical description</label>
            <Textarea 
              rows={2} 
              className={inputClass}
              {...register("accusedDescription")} 
            />
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
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={fieldLabel + " mb-0"}>Itemized property / loss</label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ description: "", value: undefined })}
            className="border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add item
          </Button>
        </div>
        <div className="space-y-2">
          {fields.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">No items added yet.</p>
          )}
          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input
                className={`flex-1 ${inputClass}`}
                placeholder="Item description"
                {...register(`lossItems.${idx}.description` as const)}
              />
              <Input
                className={`w-32 ${inputClass}`}
                type="number"
                placeholder="Value (₹)"
                {...register(`lossItems.${idx}.value` as const, { valueAsNumber: true })}
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                className="rounded-lg p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
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
        <Input className={inputClass} {...register("transactionIds")} placeholder="Optional" />
      </div>

      <div>
        <label className={fieldLabel}>Physical injury details</label>
        <Textarea 
          rows={2} 
          className={inputClass}
          {...register("injuryDetails")} 
          placeholder="Optional" 
        />
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
    <div className="space-y-1.5">
      <label className={fieldLabel}>Describe exactly what happened</label>
      <Textarea 
        rows={8} 
        className={`${inputClass} leading-relaxed`}
        {...register("narrative")} 
        placeholder="Write a detailed, chronological account. Minimum 100 words recommended." 
      />
      <p className={helpText}>
        {words} word{words === 1 ? "" : "s"}{" "}
        {words < 100 && <span className="text-amber-600 dark:text-amber-400 font-medium">— aim for at least 100 for a complete draft</span>}
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
          <Button 
            type="button" 
            variant="outline" 
            size="sm"
            onClick={() => append({ name: "", contact: "" })}
            className="border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add witness
          </Button>
        </div>
        <div className="space-y-2">
          {fields.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 italic">No witnesses added yet.</p>}
          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input className={`flex-1 ${inputClass}`} placeholder="Name" {...register(`witnesses.${idx}.name` as const)} />
              <Input className={`flex-1 ${inputClass}`} placeholder="Contact (optional)" {...register(`witnesses.${idx}.contact` as const)} />
              <button
                type="button"
                onClick={() => remove(idx)}
                className="rounded-lg p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
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
    ["Narrative", data.narrative ? `${data.narrative.slice(0, 140)}${data.narrative.length > 140 ? "…" : ""}` : undefined],
    ["Witnesses", data.witnesses?.map((w) => w.name).filter(Boolean).join(", ")],
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/40 p-4 text-xs text-slate-700 dark:text-slate-300 space-y-2">
        {rows.map(([label, value]) =>
          value ? (
            <p key={label} className="leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{label}: </span>
              <span className="text-slate-600 dark:text-slate-400">{value}</span>
            </p>
          ) : null
        )}
      </div>
      <label className="flex items-start gap-2.5 text-xs font-medium text-slate-900 dark:text-slate-100 cursor-pointer select-none">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-900"
          {...register("confirmed")}
        />
        <span>I confirm the details above are accurate to the best of my knowledge.</span>
      </label>
    </div>
  );
}