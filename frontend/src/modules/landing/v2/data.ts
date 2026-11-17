import { useEffect, useState } from "react";
import { getCall } from "@/services/frappe";
import { CONFIG, DEPARTMENTS, type Dept } from "./content";

export interface Doctor { name: string; doctor_name: string; doctor_name_ur?: string; specialization?: string; default_fee?: number; photo?: string; qualification?: string;
  consultation_room?: string; next_date?: string | null; free_slots?: number; days: { day: string; from: string; to: string }[] }
export interface Ward { ward_name: string; ward_name_ur?: string; ward_type: string; gender?: string; floor?: string; bed_charge_per_day?: number; nursing_charge_per_shift?: number; icu_surcharge_per_day?: number; beds: number }
export interface Pkg { package_name: string; price: number; days?: number; description?: string; ward_type?: string; inclusions: string[] }
export interface Site {
  clinic: { name: string; name_ur?: string; phone?: string; address?: string };
  departments: { department_name: string; department_name_ur?: string }[]; wards: Ward[]; packages: Pkg[]; beds: number; doctors: number;
}
export interface Opts { doctors: Doctor[]; specializations: { name: string; name_ur?: string }[] }

/** One fetch per page load, shared by every component. */
let siteP: Promise<Site> | null = null;
let optsP: Promise<Opts> | null = null;
function useOnce<T>(get: () => Promise<T>): [T | null, boolean] {
  const [v, setV] = useState<T | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => { let on = true; get().then((x) => on && setV(x)).catch(() => {}).finally(() => on && setDone(true)); return () => { on = false; }; }, []);
  return [v, done];
}
export const useSite = () => useOnce(() => (siteP ??= getCall<Site>("hospital_vvs.api.public.site_info")));
export const useDoctors = () => useOnce(() => (optsP ??= getCall<Opts>("hospital_vvs.api.appointments.public_options").catch((e) => { optsP = null; throw e; })));

export const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
export const tel = (p?: string) => `tel:${(p ?? "").replace(/[^\d+]/g, "")}`;
export const hasWa = !/x/i.test(CONFIG.whatsapp) && CONFIG.whatsapp.length >= 10;
export const phoneOf = (kind: string, main?: string) => CONFIG.phones[kind] || main || "";
export const mapQuery = (address?: string) => CONFIG.mapQuery || (address ? (/pakistan/i.test(address) ? address : `${address}, Pakistan`) : "Lyallpur Medical Complex, People's Colony No 1, Faisalabad");
export const deptOf = (d: Doctor): Dept | undefined => DEPARTMENTS.find((x) => x.match.some((m) => (d.specialization ?? "").toLowerCase().includes(m)));
export const doctorsOf = (dept: Dept, list: Doctor[]) => list.filter((d) => deptOf(d)?.slug === dept.slug);
export const slugDoc = (d: Doctor) => d.name.toLowerCase();
export const initials = (n: string) => n.replace(/^dr\.?\s+/i, "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const todayISO = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
export const fmtDate = (d?: string | null, ur = false) => (d ? new Date(d + "T00:00").toLocaleDateString(ur ? "ur-PK" : "en-PK", { weekday: "short", day: "numeric", month: "short" }) : "");
