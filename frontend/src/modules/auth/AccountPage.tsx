import { useState } from "react";
import toast from "react-hot-toast";
import { Building2, Globe, KeyRound, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { call, humanizeError } from "@/lib/api";
import { Avatarish, Field, inputCls, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useBrandFonts, HospitalLogo } from "@/components/brand";

/** My account (D-71): who I am, my roles and branches, change my password. Open to every signed-in user. */
export default function AccountPage() {
  const { boot, branch, logout } = useAuth();
  useBrandFonts();
  const [old, setOld] = useState(""); const [pwd, setPwd] = useState(""); const [again, setAgain] = useState(""); const [busy, setBusy] = useState(false);
  if (!boot) return null;
  const roles = boot.roles.filter((r) => !["All", "Guest", "Desk User"].includes(r));
  const change = async () => {
    if (pwd.length < 8) { toast.error("Use at least 8 characters."); return; }
    if (pwd !== again) { toast.error("The new passwords don't match."); return; }
    setBusy(true);
    try {
      await call("frappe.core.doctype.user.user.update_password", { new_password: pwd, old_password: old, logout_all_sessions: 0 });
      toast.success("Password changed");
      setOld(""); setPwd(""); setAgain("");
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-ink-900 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_0%_0%,rgb(var(--tl-500)/0.30),transparent_60%)]" />
        <HospitalLogo onDark className="pointer-events-none absolute -end-10 -top-10 h-56 w-56 opacity-[0.10]" />
        <div className="relative flex flex-wrap items-center gap-4">
          <Avatarish name={boot.full_name} src={boot.image} size={16} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-300/80">My account</div>
            <h1 className="vvs-serif text-3xl font-semibold tracking-tight">{boot.full_name}</h1>
            <p className="flex items-center gap-1.5 text-sm text-white/70"><Mail className="h-4 w-4" />{boot.user}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/hms/vvsdesk" target="_blank" rel="noreferrer"><Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10"><Globe className="h-4 w-4" />Visit site</Button></a>
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => void logout()}><LogOut className="h-4 w-4" />Sign out</Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={<span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-teal-500" />Profile</span>}>
          <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
            <dt className="text-muted-foreground">Name</dt><dd className="font-medium">{boot.full_name}</dd>
            <dt className="text-muted-foreground">Sign-in</dt><dd className="font-medium">{boot.user}</dd>
            {boot.doctor && <><dt className="text-muted-foreground">Doctor</dt><dd className="font-medium">{boot.doctor.doctor_name}</dd></>}
            <dt className="text-muted-foreground">Branch</dt><dd className="flex items-center gap-1.5 font-medium"><Building2 className="h-4 w-4 text-muted-foreground" />{branch || "—"}{boot.branches.length > 1 && <span className="text-xs text-muted-foreground">(of {boot.branches.length})</span>}</dd>
            <dt className="text-muted-foreground">Organisation</dt><dd className="font-medium">{boot.clinic.name}</dd>
          </dl>
          <div className="mt-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">Roles</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{(boot.is_admin ? ["Administrator", ...roles] : roles).map((r) => <span key={r} className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-teal-800 dark:text-teal-300">{r}</span>)}</div>
        </Section>

        <Section title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-teal-500" />Change password</span>}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void change(); }}>
            <input type="text" autoComplete="username" value={boot.user} readOnly hidden />
            <Field label="Current password" required><input type="password" autoComplete="current-password" className={inputCls} value={old} onChange={(e) => setOld(e.target.value)} /></Field>
            <Field label="New password" required hint="At least 8 characters; mix letters, numbers and symbols."><input type="password" autoComplete="new-password" className={inputCls} value={pwd} onChange={(e) => setPwd(e.target.value)} /></Field>
            <Field label="New password again" required><input type="password" autoComplete="new-password" className={inputCls} value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
            <Button type="submit" variant="save" disabled={busy || !old || !pwd || !again}><ShieldCheck className="h-4 w-4" />Change password</Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">Other signed-in devices stay signed in. <span className="vvs-gold-text">VVSDesk</span> logs every sign-in.</p>
        </Section>
      </div>
    </div>
  );
}
