/** QR verification of a printed imaging report (D-91) and the doctor's view of a patient-shared link. No findings on the check page. */
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, BadgeCheck, Clock3, Loader2, Printer, ShieldAlert, ShieldCheck } from "lucide-react";
import { getCall } from "@/services/frappe";
import { Wrap } from "../SiteV2";
import { btn, card, Reveal, useTitle } from "../ui";

interface Check { valid: boolean; superseded?: boolean; report?: string; procedure?: string; modality?: string; patient?: string; gender?: string; scan_date?: string;
  signed_at?: string; version?: number; radiologist?: string; pmdc?: string; clinic?: string; phone?: string }

export function RadiologyVerify() {
  useTitle("Verify an imaging report", "Check that a radiology report from Lyallpur Medical Complex is genuine.");
  const { name = "", sig = "" } = useParams();
  const [c, setC] = useState<Check | null>(null);
  useEffect(() => { getCall<Check>("hospital_vvs.api.radiology.verify", { name, sig }).then(setC).catch(() => setC({ valid: false })); }, [name, sig]);
  const ok = c?.valid;
  return (
    <section className="min-h-[70vh] bg-[var(--soft)] py-16">
      <Wrap className="max-w-2xl">
        {!c ? <div className={`${card} flex items-center justify-center gap-2 p-16 text-[var(--muted)]`}><Loader2 className="h-5 w-5 animate-spin" />Checking…</div> : (
          <Reveal className={`${card} overflow-hidden hover:translate-y-0`}>
            <div className={`relative px-6 py-10 text-center text-white ${ok ? "bg-gradient-to-br from-emerald-600 to-[var(--btn-from)]" : c.superseded ? "bg-gradient-to-br from-amber-600 to-amber-700" : "bg-gradient-to-br from-rose-600 to-rose-800"}`}>
              <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/15 ring-8 ring-white/10">{ok ? <ShieldCheck className="h-10 w-10" /> : c.superseded ? <AlertTriangle className="h-10 w-10" /> : <ShieldAlert className="h-10 w-10" />}</span>
              <h1 className="s2-display mt-5 text-[2rem]">{ok ? "Genuine report" : c.superseded ? "A newer version exists" : "Not verified"}</h1>
              <p className="mx-auto mt-2 max-w-md text-white/80">{ok ? "This report was issued and digitally signed by Lyallpur Medical Complex and has not been changed since."
                : c.superseded ? "This printout is genuine but has since been updated with an addendum. Ask the patient for the latest version."
                : "We could not match this code to a signed report. The document may be altered or not issued by us — please contact radiology."}</p>
            </div>
            {(ok || c.superseded) && <dl className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
              {([["Report", c.report], ["Examination", c.procedure], ["Modality", c.modality], ["Patient", `${c.patient ?? ""}${c.gender ? ` · ${c.gender}` : ""}`],
                ["Scan date", c.scan_date], ["Signed", c.signed_at], ["Radiologist", c.radiologist], ["Version", c.version ? `v${c.version}` : ""]] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="bg-[var(--surface)] px-6 py-4"><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>))}
            </dl>}
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] px-6 py-5 text-sm text-[var(--muted)]">
              <BadgeCheck className="h-5 w-5 text-[var(--primary)]" /><span className="flex-1">Findings are never shown on this page. {c.clinic}{c.phone ? ` · ${c.phone}` : ""}</span>
              <Link to="/site/radiology" className="font-semibold text-[var(--primary)]">Radiology →</Link>
            </div>
          </Reveal>)}
      </Wrap>
    </section>
  );
}

export function RadiologyShared() {
  useTitle("Shared imaging report");
  const { token = "" } = useParams();
  const [r, setR] = useState<{ html?: string; error?: string; expires_at?: string; data?: { title: string; patient: { name: string } } } | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => { getCall<typeof r>("hospital_vvs.api.radiology.shared", { token }).then(setR).catch(() => setR({ error: "This link is not valid." })); }, [token]);
  useEffect(() => { const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex,nofollow"; document.head.appendChild(m); return () => m.remove(); }, []);
  return (
    <section className="min-h-[70vh] bg-[var(--soft)] py-10">
      <Wrap className="max-w-5xl">
        {!r ? <div className={`${card} flex items-center justify-center gap-2 p-16 text-[var(--muted)]`}><Loader2 className="h-5 w-5 animate-spin" />Opening…</div>
          : r.error ? <div className={`${card} p-12 text-center`}><ShieldAlert className="mx-auto h-12 w-12 text-rose-500" /><h1 className="s2-display mt-4 text-2xl">{r.error}</h1><Link to="/site/radiology" className={`${btn.ghost} mt-6`}>Radiology</Link></div>
          : <div className={`${card} overflow-hidden hover:translate-y-0`}>
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0 flex-1"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Shared by the patient</div><h1 className="truncate text-lg font-bold">{r.data?.title} · {r.data?.patient.name}</h1></div>
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"><Clock3 className="h-3.5 w-3.5" />Link expires {r.expires_at}</span>
              <button onClick={() => frame.current?.contentWindow?.print()} className={`${btn.teal} px-4 py-2 text-sm`}><Printer className="h-4 w-4" />Print</button>
            </div>
            <iframe ref={frame} title="Report" srcDoc={r.html} sandbox="allow-same-origin allow-modals" className="h-[80vh] w-full bg-white" />
          </div>}
      </Wrap>
    </section>
  );
}
