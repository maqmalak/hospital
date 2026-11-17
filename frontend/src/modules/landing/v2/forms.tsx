import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { postCall } from "@/services/frappe";
import { btn } from "./ui";

const field = "peer w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 pb-2.5 pt-6 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-ring)]";
const lab = "pointer-events-none absolute start-4 top-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] peer-focus:text-[var(--primary)]";

/** Floating-label input. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="relative block">{children}<span className={lab}>{label}</span></label>;
}

/**
 * Website enquiry form → `api.public.site_enquiry` (a received Communication in the desk; five per hour per visitor).
 * `extra` adds one select (department, position…) whose value goes with the message.
 */
export function EnquiryForm({ kind, messageLabel = "Message", submit = "Send message", extra, note }: {
  kind: "Contact" | "Pharmacy" | "Careers"; messageLabel?: string; submit?: string; note?: string;
  extra?: { label: string; options: string[] };
}) {
  const [v, setV] = useState({ name: "", phone: "", email: "", message: "", extra: "" });
  const [state, setState] = useState<"" | "busy" | "done">("");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const phoneOk = v.phone.replace(/\D/g, "").length >= 10;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim() || !phoneOk || !v.message.trim()) { setErr("Please give your name, a phone number with at least 10 digits, and a message."); return; }
    setErr(""); setState("busy");
    try {
      await postCall("hospital_vvs.api.public.site_enquiry", { kind, ...v, extra: extra && v.extra ? `${extra.label}: ${v.extra}` : "" });
      setState("done");
    } catch (x) {
      const m = (x as { message?: string })?.message || "";
      setErr(/429|too many/i.test(m) ? "Too many messages from this connection — please call us instead." : "We couldn't send that. Please try again, or call us.");
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
      <Field label={`${messageLabel} *`}><textarea className={`${field} min-h-[130px] resize-y`} value={v.message} onChange={set("message")} required /></Field>
      {err && <p className="text-sm font-medium text-[var(--accent)]" role="alert">{err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="max-w-sm text-xs text-[var(--muted)]">{note ?? "We use your details only to reply to this message."}</p>
        <button disabled={state === "busy"} className={`${btn.teal} disabled:opacity-60`}>{state === "busy" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 rtl:-scale-x-100" />}{submit}</button>
      </div>
    </form>
  );
}
