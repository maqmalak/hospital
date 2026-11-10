import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, KeyRound, Mail, Search, ShieldCheck, ShieldHalf, UserCog, UserPlus, Users, X } from "lucide-react";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, PageHeader, StatCard, Tabs } from "@/components/common";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

/** /users — Users & roles (PW Admin, D-58), laid out like the real-estate admin screens: a users table, a user detail with a
 *  profile card beside the roles checklist, roles with their people and screens, and the page-access grid. */
interface U { name: string; full_name: string; enabled: number; last_login?: string; mobile_no?: string; user_image?: string; roles: string[]; system_manager: boolean;
  branches: string[]; counters: string[]; doctor?: string; creation: string }
interface RoleMeta { role: string; description: string; users: number; two_factor: boolean; screens: { route: string; label: string }[] }
interface Screen { route: string; label: string; module_switch?: string; roles: string[] }
interface UsersRes { users: U[]; roles: RoleMeta[]; branches: string[]; two_factor: number }

const short = (r: string) => r.replace(/^PW /, "");
const when = (s?: string) => (s ? new Date(s.replace(" ", "T")).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function UsersPage() {
  const [tab, setTab] = useState<"users" | "roles" | "access">("users");
  const { data, refetch, isLoading } = useApi<UsersRes>("users.users");
  const users = data?.users ?? [];
  const active = users.filter((u) => u.enabled).length;
  return (
    <div className="space-y-4">
      <PageHeader title="Users & roles" icon={UserCog} color="from-zinc-600 to-slate-800" subtitle="Staff accounts, their roles and branch, and which screens each role opens" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active users" value={active} icon={Users} tone="teal" />
        <StatCard label="Disabled" value={users.length - active} icon={X} tone="rose" />
        <StatCard label="Hospital roles" value={data?.roles.length ?? 0} icon={ShieldHalf} tone="violet" />
        <StatCard label="Two-factor login" value={data?.two_factor ? "On" : "Off"} hint={data?.two_factor ? "for flagged roles" : "switch on before go-live"} icon={ShieldCheck} tone={data?.two_factor ? "teal" : "amber"} />
      </div>
      <Tabs tabs={[{ key: "users", label: "Users", count: users.length }, { key: "roles", label: "Roles", count: data?.roles.length }, { key: "access", label: "Page access" }]} value={tab} onChange={setTab} />
      {isLoading || !data ? <Skeleton className="h-96 rounded-2xl" /> : tab === "users" ? <UsersTab data={data} onChanged={() => void refetch()} />
        : tab === "roles" ? <RolesTab data={data} onChanged={() => void refetch()} /> : <AccessTab />}
    </div>
  );
}

// ------------------------------------------------------------------ users
function UsersTab({ data, onChanged }: { data: UsersRes; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<"" | "Active" | "Disabled">("");
  const [open, setOpen] = useState<U | "new" | null>(null);
  const rows = data.users.filter((u) => (!q || `${u.full_name} ${u.name} ${u.mobile_no ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    && (!role || u.roles.includes(role)) && (!status || (status === "Active" ? u.enabled : !u.enabled)));
  if (open) return <UserDetail user={open === "new" ? null : open} data={data} onBack={() => setOpen(null)} onSaved={() => { onChanged(); setOpen(null); }} />;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div><div className="font-semibold">Users</div><div className="text-xs text-muted-foreground">{rows.length} of {data.users.length} users</div></div>
        <div className="relative ms-auto min-w-56"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className={inputCls + " h-9 ps-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or mobile" /></div>
        <select className={inputCls.replace("w-full", "") + " h-9 w-44"} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>{data.roles.map((r) => <option key={r.role} value={r.role}>{short(r.role)}</option>)}</select>
        <select className={inputCls.replace("w-full", "") + " h-9 w-32"} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">Any status</option><option>Active</option><option>Disabled</option></select>
        <Button variant="save" size="sm" onClick={() => setOpen("new")}><UserPlus className="h-4 w-4" /> New user</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
            <th className="px-3 py-2 text-start font-semibold">User</th><th className="px-3 py-2 text-start font-semibold">Roles</th><th className="px-3 py-2 text-start font-semibold">Branch</th>
            <th className="px-3 py-2 text-start font-semibold">Counters</th><th className="px-3 py-2 text-start font-semibold">Status</th><th className="px-3 py-2 text-start font-semibold">Last login</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((u) => (
              <tr key={u.name} onClick={() => setOpen(u)} className="cursor-pointer transition-colors hover:bg-muted/40">
                <td className="px-3 py-2.5"><div className="flex items-center gap-2.5"><Avatar name={u.full_name || u.name} src={u.user_image} size="sm" />
                  <div className="min-w-0"><p className="truncate font-medium">{u.full_name || u.name}</p><p className="truncate text-xs text-muted-foreground">{u.name}</p></div></div></td>
                <td className="px-3 py-2.5"><div className="flex flex-wrap items-center gap-1">{u.roles.slice(0, 2).map((r) => <Badge key={r} variant="outline">{short(r)}</Badge>)}
                  {u.roles.length > 2 && <Badge variant="secondary">+{u.roles.length - 2}</Badge>}{!u.roles.length && <span className="text-xs text-muted-foreground">—</span>}</div></td>
                <td className="px-3 py-2.5 text-xs">{u.roles.includes("PW Admin") ? <span className="text-muted-foreground">All branches</span> : u.branches.join(", ") || <span className="text-rose-600">none</span>}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{u.counters.join(", ") || "—"}</td>
                <td className="px-3 py-2.5"><Badge variant={u.enabled ? "success" : "destructive"}>{u.enabled ? "Enabled" : "Disabled"}</Badge></td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{when(u.last_login)}</td>
              </tr>))}
          </tbody>
        </table>
        {!rows.length && <div className="p-6"><Empty title="No users match" icon={Users} /></div>}
      </div>
    </div>
  );
}

function UserDetail({ user, data, onBack, onSaved }: { user: U | null; data: UsersRes; onBack: () => void; onSaved: () => void }) {
  const { boot } = useAuth();
  const isMe = !!user && user.name === boot?.user;
  const [f, setF] = useState({ email: user?.name ?? "", full_name: user?.full_name ?? "", mobile_no: user?.mobile_no ?? "", enabled: user ? user.enabled : 1,
    roles: new Set(user?.roles ?? []), branches: new Set(user?.branches?.length ? user.branches : data.branches.slice(0, 1)), new_password: "" });
  const [busy, setBusy] = useState(false);
  const admin = f.roles.has("PW Admin");
  const toggle = (key: "roles" | "branches", v: string) => setF((x) => { const s = new Set(x[key]); s.has(v) ? s.delete(v) : s.add(v); return { ...x, [key]: s }; });
  const save = async () => {
    setBusy(true);
    try {
      const r = await call<{ created: boolean }>("users.save_user", { data: JSON.stringify({ ...f, roles: [...f.roles], branches: [...f.branches] }) });
      toast.success(r.created ? "User created" : "User saved"); onSaved();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); onSaved(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> Users</button>
        <h2 className="text-lg font-semibold">{user ? user.full_name || user.name : "New user"}</h2>
        {user && !isMe && <div className="ms-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void act(() => call("users.send_reset_link", { user: user.name }), "Reset link sent by email")}><Mail className="h-4 w-4" /> Send reset link</Button>
          <Button variant={user.enabled ? "danger" : "save"} size="sm" onClick={() => void act(() => call("users.set_enabled", { user: user.name, enabled: user.enabled ? 0 : 1 }), user.enabled ? "User disabled and signed out" : "User enabled")}>
            {user.enabled ? "Disable user" : "Enable user"}</Button></div>}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <Avatar name={f.full_name || f.email || "?"} src={user?.user_image} size="lg" />
            <div><p className="font-semibold">{f.full_name || "—"}</p><p className="text-sm text-muted-foreground">{f.email || "email is the login"}</p></div>
            <Badge variant={f.enabled ? "success" : "destructive"}>{f.enabled ? "Enabled" : "Disabled"}</Badge>
          </div>
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <Field label="Full name" required><input className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="e.g. Nargis Bibi" /></Field>
            <Field label="Email (login)" required><input className={inputCls} value={f.email} disabled={!!user} onChange={(e) => setF({ ...f, email: e.target.value.trim() })} placeholder="name@hospital.pk" /></Field>
            <Field label="Mobile"><input className={inputCls} value={f.mobile_no} onChange={(e) => setF({ ...f, mobile_no: e.target.value })} placeholder="+92 300 1234567" /></Field>
            <Field label={user ? "New password (optional)" : "Password"} hint="The site's password-strength rule applies; or send a reset link instead.">
              <div className="relative"><KeyRound className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                <input type="password" autoComplete="new-password" className={inputCls + " ps-9"} value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></div></Field>
            {!isMe && <Checkbox label="Account enabled" checked={!!f.enabled} onChange={() => setF({ ...f, enabled: f.enabled ? 0 : 1 })} />}
          </div>
          {user && <dl className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Last login</dt><dd className="font-medium">{when(user.last_login)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Created</dt><dd className="font-medium">{when(user.creation)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Counters</dt><dd className="text-end font-medium">{user.counters.join(", ") || "—"}</dd></div>
            {user.doctor && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Doctor record</dt><dd className="font-medium">{user.doctor}</dd></div>}
            {user.system_manager && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">ERPNext</dt><dd className="font-medium">System Manager</dd></div>}
          </dl>}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border p-4"><div><div className="font-semibold">Roles</div><div className="text-xs text-muted-foreground">{f.roles.size} selected · each role opens its own screens (Page access tab)</div></div></div>
            <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
              {data.roles.map((r) => {
                const on = f.roles.has(r.role), locked = isMe && r.role === "PW Admin";
                return (
                  <label key={r.role} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors", on ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40", locked && "cursor-not-allowed opacity-70")}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-600" checked={on} disabled={locked} onChange={() => toggle("roles", r.role)} />
                    <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-semibold">{short(r.role)}{r.two_factor && <Badge variant="warning" className="!px-1.5 !py-0 text-[10px]">2FA</Badge>}</span>
                      <span className="block text-xs text-muted-foreground">{r.description}</span><span className="block text-[10px] text-muted-foreground">{r.screens.length} screens · {r.users} users</span></span>
                  </label>);
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4"><div className="font-semibold">Branch</div><div className="text-xs text-muted-foreground">{admin ? "Admins work in every branch." : "Where this person works; the first ticked is their default."}</div></div>
            <div className="flex flex-wrap gap-2 p-4">{data.branches.map((b) => <Checkbox key={b} label={b} checked={admin || f.branches.has(b)} disabled={admin} onChange={() => toggle("branches", b)} />)}</div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onBack}>Cancel</Button>
            <Button variant="save" loading={busy} disabled={!f.full_name || !f.email || !f.roles.size} onClick={() => void save()}>{user ? "Save user" : "Create user"}</Button></div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ roles
function RolesTab({ data, onChanged }: { data: UsersRes; onChanged: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const role = data.roles.find((r) => r.role === sel);
  if (!role) return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.roles.map((r) => (
        <button key={r.role} onClick={() => setSel(r.role)} className="rounded-2xl border border-border bg-card p-4 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-zinc-700 text-white"><ShieldHalf className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><div className="truncate font-semibold">{short(r.role)}</div><div className="text-xs text-muted-foreground">{r.users} users · {r.screens.length} screens</div></div>
            {r.two_factor && <Badge variant="warning">2FA</Badge>}</div>
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
        </button>))}
    </div>
  );
  const members = data.users.filter((u) => u.roles.includes(role.role));
  const setRole = async (u: U, on: boolean) => {
    const roles = on ? [...new Set([...u.roles, role.role])] : u.roles.filter((r) => r !== role.role);
    try { await call("users.save_user", { data: JSON.stringify({ email: u.name, full_name: u.full_name, mobile_no: u.mobile_no, enabled: u.enabled, roles, branches: u.branches }) });
      toast.success(on ? `${u.full_name} added to ${short(role.role)}` : `${u.full_name} removed from ${short(role.role)}`); onChanged(); }
    catch (e) { toast.error(humanizeError(e)); }
  };
  return (
    <div className="space-y-4">
      <button onClick={() => setSel(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> Roles</button>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-zinc-700 text-white"><ShieldHalf className="h-5 w-5" /></span>
            <div><div className="text-lg font-semibold">{short(role.role)}</div><div className="text-xs text-muted-foreground">{role.role}</div></div></div>
          <p className="mt-3 text-sm text-muted-foreground">{role.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">{role.two_factor && <Badge variant="warning">Two-factor login required</Badge>}<Badge variant="info">{role.screens.length} screens</Badge></div>
          <div className="mt-4 border-t border-border pt-3"><div className="mb-2 text-xs font-semibold text-muted-foreground">Screens this role opens</div>
            <div className="flex flex-wrap gap-1">{role.screens.map((s) => <Badge key={s.route} variant="outline">{s.label}</Badge>)}</div></div>
        </div>
        <div className="rounded-2xl border border-border bg-card shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border p-4"><div><div className="font-semibold">People with this role</div><div className="text-xs text-muted-foreground">{members.length} users</div></div>
            <Button size="sm" variant="save" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add user</Button></div>
          <ul className="divide-y divide-border">
            {members.map((u) => (
              <li key={u.name} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={u.full_name} src={u.user_image} size="sm" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{u.full_name}</div><div className="truncate text-xs text-muted-foreground">{u.name}</div></div>
                {!u.enabled && <Badge variant="destructive">Disabled</Badge>}
                <button title="Remove from this role" onClick={() => void setRole(u, false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><X className="h-4 w-4" /></button>
              </li>))}
            {!members.length && <li className="p-6"><Empty title="Nobody has this role yet" icon={Users} /></li>}
          </ul>
        </div>
      </div>
      {adding && <AddToRole role={role.role} users={data.users.filter((u) => !u.roles.includes(role.role))} onClose={() => setAdding(false)} onPick={(u) => { setAdding(false); void setRole(u, true); }} />}
    </div>
  );
}

function AddToRole({ role, users, onClose, onPick }: { role: string; users: U[]; onClose: () => void; onPick: (u: U) => void }) {
  const [q, setQ] = useState("");
  const list = users.filter((u) => !q || `${u.full_name} ${u.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  return (
    <Dialog open onClose={onClose} title={`Add a user to ${short(role)}`} size="md">
      <input autoFocus className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
      <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {list.map((u) => <li key={u.name}><button onClick={() => onPick(u)} className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-muted/50">
          <Avatar name={u.full_name} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{u.full_name}</span><span className="block truncate text-xs text-muted-foreground">{u.roles.map(short).join(", ")}</span></span></button></li>)}
        {!list.length && <li className="p-4 text-center text-sm text-muted-foreground">No one else to add</li>}
      </ul>
    </Dialog>
  );
}

// ------------------------------------------------------------------ page access grid
function AccessTab() {
  const { data, refetch } = useApi<{ roles: RoleMeta[]; screens: Screen[] }>("users.roles");
  const [q, setQ] = useState("");
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setEdits({}), [data]);
  const roles = useMemo(() => (data?.roles ?? []).map((r) => r.role).filter((r) => r !== "PW Admin"), [data]);
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  const rolesOf = (s: Screen) => edits[s.route] ?? s.roles;
  const flip = (s: Screen, role: string) => {
    if (s.route === "/users") return;
    const cur = rolesOf(s);
    setEdits({ ...edits, [s.route]: cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role] });
  };
  const changed = Object.keys(edits).filter((k) => JSON.stringify([...edits[k]].sort()) !== JSON.stringify([...(data.screens.find((s) => s.route === k)?.roles ?? [])].sort()));
  const save = async () => {
    setBusy(true);
    try { for (const route of changed) await call("users.save_screen_roles", { route, roles: JSON.stringify(edits[route]) }); toast.success(`${changed.length} screen${changed.length === 1 ? "" : "s"} updated — users see it at their next page load`); void refetch(); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  const screens = data.screens.filter((s) => !q || `${s.label} ${s.route}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div><div className="font-semibold">Page access</div><div className="text-xs text-muted-foreground">Tick the roles that open each screen · PW Admin opens every screen · the server checks the same roles</div></div>
        <div className="relative ms-auto min-w-56"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " h-9 ps-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search screen" /></div>
        <Button variant="outline" size="sm" disabled={!changed.length} onClick={() => setEdits({})}>Discard</Button>
        <Button variant="save" size="sm" loading={busy} disabled={!changed.length} onClick={() => void save()}>Save {changed.length ? `(${changed.length})` : ""}</Button>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]"><tr>
            <th className="sticky start-0 z-20 min-w-56 bg-card px-3 py-2 text-start font-semibold">Screen</th>
            {roles.map((r) => <th key={r} className="px-1 py-2 font-semibold"><span className="block w-16 truncate text-center" title={r}>{short(r)}</span></th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {screens.map((s) => {
              const cur = rolesOf(s), dirty = changed.includes(s.route);
              return (
                <tr key={s.route} className={cn("hover:bg-muted/30", dirty && "bg-amber-500/5")}>
                  <td className="sticky start-0 bg-card px-3 py-1.5"><div className="font-medium">{s.label}</div><div className="text-[10px] text-muted-foreground">{s.route}{s.module_switch ? ` · needs ${s.module_switch.replace("enable_", "")}` : ""}</div></td>
                  {roles.map((r) => <td key={r} className="text-center"><input type="checkbox" aria-label={`${s.label} — ${r}`} className="h-4 w-4 accent-teal-600" checked={cur.includes(r)} disabled={s.route === "/users"} onChange={() => flip(s, r)} /></td>)}
                </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
