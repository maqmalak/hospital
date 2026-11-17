import { useState } from "react";
import { CheckCircle2, FileUp, Loader2, Send, X } from "lucide-react";
import { postCall } from "@/services/frappe";
import { btn } from "./ui";

const field = "peer w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 pb-2.5 pt-6 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-ring)]";
const lab = "pointer-events-none absolute start-4 top-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] peer-focus:text-[var(--primary)]";

const MAX = 5 * 1024 * 1024;
const dataUrl = (f: File) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(f); });

/** Floating-label input. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="relative block">{children}<span className={lab}>{label}</span></label>;
}

/**
 * Website enquiry form → `api.public.site_enquiry` (a received Communication in the desk; five per hour per visitor).
 * `extra` adds one select (department, position…) whose value goes with the message.
 * `upload` adds one optional file (prescription photo, CV) — up to 5 MB, attached privately to the enquiry.
 */
export function EnquiryForm({ kind, messageLabel = "Message", submit = "Send message", extra, note, upload }: {
  kind: "Contact" | "Pharmacy" | "Careers"; messageLabel?: string; submit?: string; note?: string;
  extra?: { label: string; options: string[] };
  upload?: { label: string; hint: string; accept: string };
}) {
  const [file, setFile] = useState<File | null>(null);
  const [v, setV] = useState({ name: "", phone: "", email: "", message: "", extra: "" });
  const [state, setState] = useState<"" | "busy" | "done">("");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const phoneOk = v.phone.replace(/\D/g, "").length >= 10;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim() || !phoneOk || (!v.message.trim() && !file)) { setErr("Please give your name, a phone number with at least 10 digits, and a message."); return; }
    if (file && file.size > MAX) { setErr("That file is larger than 5 MB — please send a smaller photo or PDF."); return; }
    setErr(""); setState("busy");
    try {
      const f = file ? { file_name: file.name, file_data: await dataUrl(file) } : {};
      await postCall("hospital_vvs.api.public.site_enquiry", { kind, ...v, message: v.message.trim() || "Please see the attached file.", ...f, extra: extra && v.extra ? `${extra.label}: ${v.extra}` : "" });
      setState("done");
    } catch (x) {
      const m = (x as { message?: string })?.message || "";
      setErr(/429|too many/i.test(m) ? "Too many messages from this connection — please call us instead."
        : /file|5 MB/i.test(m) ? m : "We couldn't send that. Please try again, or call us.");
      setState("");
    }
  };
  if (state === "done") return (
    <div className="flex flex-col items-center rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-10 text-center" role="status">
      <CheckCircle2 className="h-12 w-12 text-emerald-500" /><h3 className="s2-display mt-4 text-2xl">Thank you, {v.name.split(" ")[0]}.</h3>
      <p className="mt-2 max-w-sm text-[var(--muted)]">We've received your message and will call you on <span dir="ltr">{v.phone}</span>. For anything urgent, please phone the hospital.</p>
    </div>
  );
  return (
    <form onSubmit={send} noValidate className="space-y-3 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_24px_50px_-34px_rgba(8,48,58,0.5)] sm:p-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name *"><input className={field} value={v.name} onChange={set("name")} autoComplete="name" required /></Field>
        <Field label="Phone *"><input className={field} value={v.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" dir="ltr" required aria-invalid={!!v.phone && !phoneOk} /></Field>
      </div>
      <Field label="Email (optional)"><input className={field} type="email" value={v.email} onChange={set("email")} autoComplete="email" dir="ltr" /></Field>
      {extra && <Field label={extra.label}><select className={field} value={v.extra} onChange={set("extra")}><option value="">—</option>{extra.options.map((o) => <option key={o}>{o}</option>)}</select></Field>}
      {upload && (file ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--soft)] px-4 py-3 text-sm">
          <FileUp className="h-5 w-5 shrink-0 text-[var(--primary)]" /><span className="min-w-0 flex-1 truncate font-medium" dir="ltr">{file.name}</span>
          <span className="shrink-0 text-xs text-[var(--muted)]">{(file.size / 1048576).toFixed(1)} MB</span>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-[var(--surface)]"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--line)] px-4 py-4 text-sm transition-colors hover:border-[var(--primary)] focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--primary-ring)]">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--primary)]"><FileUp className="h-5 w-5" /></span>
          <span><span className="block font-semibold">{upload.label}</span><span className="block text-xs text-[var(--muted)]">{upload.hint}</span></span>
          <input type="file" accept={upload.accept} className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </label>
      ))}
      <Field label={`${messageLabel}${upload && file ? "" : " *"}`}><textarea className={`${field} min-h-[130px] resize-y`} value={v.message} onChange={set("message")} required={!file} /></Field>
      {err && <p className="text-sm font-medium text-[var(--accent)]" role="alert">{err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="max-w-sm text-xs text-[var(--muted)]">{note ?? "We use your details only to reply to this message."}</p>
        <button disabled={state === "busy"} className={`${btn.teal} disabled:opacity-60`}>{state === "busy" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 rtl:-scale-x-100" />}{submit}</button>
      </div>
    </form>
  );
}
