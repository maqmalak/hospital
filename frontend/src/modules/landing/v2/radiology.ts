/** Radiology & Imaging on the website (D-91): live catalogue, radiologists and hours from the ERP (api/radiology.py). */
import { useEffect, useState } from "react";
import { getCall } from "@/services/frappe";

export type Modality = "X-Ray" | "Ultrasound" | "Doppler";
export interface Procedure {
  name: string; procedure_name: string; code?: string; modality: Modality; category: string; body_region?: string; description?: string; prep_group?: string;
  preparation?: string; duration_min?: number; tat_hours?: number; price?: number; walk_in?: number; female_only?: number; needs_consent?: number;
}
export interface Radiologist { name: string; doctor_name: string; qualification?: string; specialization?: string; photo?: string; registration_no?: string | null;
  days: { day: string; from: string; to: string }[] }
export interface Hours { open: string; close: string; slot: number; capacity: number; days: string; walk_in: number }
export interface Catalogue { procedures: Procedure[]; radiologists: Radiologist[]; hours: Record<Modality, Hours>; prep: Record<string, string>; scans_year: number; panels: string[] }

let catP: Promise<Catalogue> | null = null;
export function useCatalogue(): [Catalogue | null, boolean] {
  const [v, setV] = useState<Catalogue | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let on = true;
    (catP ??= getCall<Catalogue>("hospital_vvs.api.radiology.catalogue").catch((e) => { catP = null; throw e; }))
      .then((x) => on && setV(x)).catch(() => {}).finally(() => on && setDone(true));
    return () => { on = false; };
  }, []);
  return [v, done];
}

export const FILTERS = [
  { key: "all", label: "All scans" }, { key: "X-Ray", label: "X-ray" }, { key: "Ultrasound", label: "Ultrasound" }, { key: "Pregnancy", label: "Pregnancy" },
  { key: "Doppler", label: "Doppler" }, { key: "Contrast Study", label: "Contrast studies" }, { key: "Guided Procedure", label: "Guided procedures" },
] as const;

export function matches(p: Procedure, f: string) {
  if (f === "all") return true;
  if (f === "X-Ray") return p.modality === "X-Ray" && p.category === "X-Ray";
  if (f === "Ultrasound") return p.modality === "Ultrasound" && p.category === "Ultrasound";
  return p.category === f || p.modality === f;
}

export const turnaround = (p: Procedure) => {
  const h = Number(p.tat_hours) || 4;
  if (p.category === "Guided Procedure") return "Pathology report in 3-5 days";
  if (h <= 3) return `Report in ${Math.max(1, Math.round(h))}-${Math.round(h) + 1} hrs`;
  if (h <= 8) return "Report the same day";
  return "Report within 24 hrs";
};

export const PHONE_RADIOLOGY = "";  // direct radiology line [confirm]; empty = the hospital landline

/** dd MMM yyyy from yyyy-mm-dd without timezone shifts. */
export const dmy = (d?: string | null) => (d ? new Date(d + "T00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : "");
export const hm12 = (t?: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
