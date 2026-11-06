import {
  Activity, BarChart3, BedDouble, CalendarClock, ClipboardList, FileClock, FilePlus2, HeartPulse, History, LayoutDashboard, LayoutGrid,
  MessageCircle, MessagesSquare, MonitorPlay, Percent, Pill, ScrollText, Settings, ShieldCheck, Stethoscope, UserPlus, Users, Merge,
  type LucideIcon,
} from "lucide-react";

export interface NavItem { route: string; label: string; icon: LucideIcon; color: string; desc: string }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Front desk", items: [
    { route: "/registration", label: "Patient registration", icon: UserPlus, color: "from-teal-500 to-emerald-500", desc: "Register, search, duplicate check, card" },
    { route: "/opd_slip", label: "OPD slip", icon: FilePlus2, color: "from-sky-500 to-cyan-500", desc: "Fee, vitals, token and receipt" },
    { route: "/appointments", label: "Appointments", icon: CalendarClock, color: "from-violet-500 to-indigo-500", desc: "Reception, web and WhatsApp bookings" },
    { route: "/appointments/inbox", label: "WhatsApp inbox", icon: MessageCircle, color: "from-green-500 to-emerald-600", desc: "Chats handed to reception" },
    { route: "/patients", label: "Patients", icon: Users, color: "from-slate-500 to-slate-700", desc: "Patient records" },
  ] },
  { label: "Clinical", items: [
    { route: "/physician-queue", label: "Physician queue", icon: ClipboardList, color: "from-amber-500 to-orange-500", desc: "Live queue per doctor" },
    { route: "/pw-prescription", label: "Prescription workspace", icon: Stethoscope, color: "from-rose-500 to-pink-500", desc: "Prescribe with safety alerts" },
    { route: "/pw-history", label: "Patient history", icon: History, color: "from-fuchsia-500 to-purple-600", desc: "Visits, vitals, prescriptions" },
    { route: "/masters", label: "Clinical masters", icon: Pill, color: "from-lime-500 to-green-600", desc: "Medicines, allergies, ICD-10, interactions" },
  ] },
  { label: "Inpatient", items: [
    { route: "/ward", label: "Wards & beds", icon: BedDouble, color: "from-emerald-500 to-teal-600", desc: "Live bed map" },
    { route: "/display/ward", label: "Ward kiosk display", icon: MonitorPlay, color: "from-cyan-600 to-blue-700", desc: "Full-screen bed status" },
    { route: "/er", label: "Emergency", icon: HeartPulse, color: "from-red-500 to-rose-600", desc: "Triage board (Phase 3)" },
  ] },
  { label: "Billing", items: [
    { route: "/billing/discount-approvals", label: "Discount approvals", icon: Percent, color: "from-orange-500 to-amber-500", desc: "Requests above the limit" },
    { route: "/messages", label: "Message log", icon: MessagesSquare, color: "from-green-600 to-teal-600", desc: "WhatsApp / SMS delivery" },
  ] },
  { label: "Insights", items: [
    { route: "/pw-dashboard", label: "Dashboard", icon: LayoutDashboard, color: "from-indigo-500 to-blue-600", desc: "Today at a glance" },
    { route: "/reports", label: "Reports", icon: BarChart3, color: "from-blue-500 to-sky-600", desc: "MIS reports" },
  ] },
  { label: "Admin", items: [
    { route: "/doctors", label: "Doctors", icon: Activity, color: "from-teal-600 to-cyan-700", desc: "Doctors, schedules, leave" },
    { route: "/patients/merge", label: "Merge patients", icon: Merge, color: "from-stone-500 to-stone-700", desc: "Merge duplicate records" },
    { route: "/audit", label: "Audit log", icon: ShieldCheck, color: "from-zinc-600 to-zinc-800", desc: "Who saw what, and changes" },
    { route: "/settings", label: "Clinic settings", icon: Settings, color: "from-gray-500 to-gray-700", desc: "Modules, billing, messaging" },
  ] },
];

export const HOME: NavItem = { route: "/pw-home", label: "Control board", icon: LayoutGrid, color: "", desc: "" };
export const ICONS = { ScrollText, FileClock };
