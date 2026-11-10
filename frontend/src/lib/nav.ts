import { Building2, CreditCard, FileCheck2, FileText, HandHeart, MessageSquareHeart, Radio, TrendingUp,
  Barcode, Beaker, Boxes, ClipboardCheck, FlaskConical, HandCoins, Lock as LockIcon, MonitorSmartphone, PackageCheck, PackageOpen, PackageSearch,
  ScanLine, Send, ShoppingCart, Truck, Wallet, Undo2, Microscope, ListChecks,
  Activity, BarChart3, BedDouble, Receipt, ReceiptText, Soup, UserCheck, ShieldPlus, ClipboardPlus, Video, CalendarClock, ClipboardList, FileClock, FilePlus2, HeartPulse, History, LayoutDashboard, LayoutGrid,
  MessageCircle, MessagesSquare, MonitorPlay, Percent, Pill, ScrollText, Settings, ShieldCheck, Stethoscope, UserPlus, Users, Merge,
  type LucideIcon,
} from "lucide-react";

export interface NavItem { route: string; label: string; icon: LucideIcon; color: string; desc: string }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Front desk", items: [
    { route: "/registration", label: "Patient registration", icon: UserPlus, color: "from-teal-500 to-emerald-500", desc: "Register, search, duplicate check, card" },
    { route: "/counter", label: "Reception counter", icon: ReceiptText, color: "from-emerald-600 to-teal-700", desc: "One cart: OPD, services, lab, IPD, online fees, dues" },
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
  { label: "Laboratory", items: [
    { route: "/lab/orders", label: "Lab orders", icon: Beaker, color: "from-cyan-500 to-sky-600", desc: "Order, bill and track tests" },
    { route: "/lab/samples", label: "Lab samples", icon: Barcode, color: "from-sky-500 to-indigo-500", desc: "Collect, label, receive, reject" },
    { route: "/tests", label: "Lab results", icon: FlaskConical, color: "from-indigo-500 to-violet-600", desc: "Result entry and release" },
    { route: "/lab/verify", label: "Lab verification", icon: Microscope, color: "from-violet-500 to-purple-600", desc: "Pathologist sign-off" },
    { route: "/lab/outsourced", label: "Outsourced tests", icon: Send, color: "from-slate-500 to-slate-700", desc: "Reference lab dispatch" },
    { route: "/lab/templates", label: "Test templates", icon: FlaskConical, color: "from-fuchsia-600 to-purple-700", desc: "Tests, ranges, prices, turnaround" },
  ] },
  { label: "Pharmacy", items: [
    { route: "/medicine_invoice", label: "Pharmacy POS", icon: ShoppingCart, color: "from-emerald-500 to-teal-600", desc: "Bill medicines with FEFO batches" },
    { route: "/pharmacy/pick", label: "Pharmacy pick", icon: ScanLine, color: "from-amber-500 to-orange-500", desc: "Pick by rack, scan batches" },
    { route: "/pharmacy/review", label: "Pharmacy review", icon: ClipboardCheck, color: "from-rose-500 to-pink-600", desc: "Pharmacist check and count" },
    { route: "/pharmacy/dispense", label: "Pharmacy handover", icon: PackageCheck, color: "from-green-500 to-emerald-600", desc: "Call, collect, hand over" },
    { route: "/pharmacy/tickets", label: "Pharmacy pipeline", icon: ListChecks, color: "from-teal-600 to-cyan-700", desc: "All tickets and stage times" },
    { route: "/pharmacy/items", label: "Medicine master", icon: PackageSearch, color: "from-lime-500 to-green-600", desc: "Stock by batch and expiry" },
  ] },
  { label: "Store", items: [
    { route: "/store/receive", label: "Receive stock", icon: Truck, color: "from-sky-600 to-blue-700", desc: "Purchase receipt by batch" },
    { route: "/store/transfers", label: "Store transfers", icon: Boxes, color: "from-indigo-500 to-blue-600", desc: "Requests and FEFO transfers" },
    { route: "/store/cycle-count", label: "Cycle count", icon: PackageOpen, color: "from-amber-600 to-orange-700", desc: "Blind counts, variances" },
    { route: "/store/returns", label: "Expiry & returns", icon: Undo2, color: "from-rose-600 to-red-700", desc: "Near expiry, quarantine, returns" },
  ] },
  { label: "Cash", items: [
    { route: "/cash/shift", label: "Cashier shift", icon: Wallet, color: "from-emerald-600 to-green-700", desc: "Open shift, movements, live totals" },
    { route: "/cash/close", label: "Close shift", icon: LockIcon, color: "from-slate-600 to-slate-800", desc: "Blind count and close" },
    { route: "/cash/approvals", label: "Cash approvals", icon: HandCoins, color: "from-amber-500 to-yellow-600", desc: "Closings and cash drops" },
    { route: "/cash/reports", label: "Cash reports", icon: ScrollText, color: "from-blue-600 to-indigo-700", desc: "Shifts, day-end, excess/short" },
  ] },
  { label: "Inpatient", items: [
    { route: "/er", label: "Emergency", icon: HeartPulse, color: "from-red-500 to-rose-600", desc: "Triage board, unknown patients, disposition" },
    { route: "/ward", label: "Wards & beds", icon: BedDouble, color: "from-emerald-500 to-teal-600", desc: "Live bed map, admit, transfer" },
    { route: "/ipd", label: "Admissions", icon: ClipboardPlus, color: "from-teal-600 to-cyan-700", desc: "Inpatients, charts, discharge" },
    { route: "/ipd/mar", label: "Drug round", icon: Pill, color: "from-green-500 to-emerald-600", desc: "Doses due, chart in one tap" },
    { route: "/ns", label: "Nursing stations", icon: Radio, color: "from-teal-500 to-sky-600", desc: "Bedside calls, replies, broadcast" },
    { route: "/ipd_slip", label: "IPD bill", icon: Receipt, color: "from-sky-600 to-indigo-600", desc: "Running bill, advances, final invoice" },
    { route: "/ipd/kitchen", label: "Diet list", icon: Soup, color: "from-lime-500 to-green-600", desc: "Meals per bed for the kitchen" },
    { route: "/ipd/pre-auth", label: "Insurance pre-auth", icon: ShieldPlus, color: "from-indigo-500 to-violet-600", desc: "Approvals before admission" },
    { route: "/roster", label: "Nurse roster", icon: UserCheck, color: "from-violet-500 to-fuchsia-600", desc: "Duty by ward and shift" },
    { route: "/ipd_report", label: "IPD reports", icon: BarChart3, color: "from-slate-600 to-slate-800", desc: "Census, stays, revenue, dues" },
    { route: "/display/ward", label: "Ward kiosk display", icon: MonitorPlay, color: "from-cyan-600 to-blue-700", desc: "Full-screen bed status" },
  ] },
  { label: "Online", items: [
    { route: "/ov-staff", label: "Online visits", icon: Video, color: "from-indigo-500 to-violet-600", desc: "Video consultations: fee, accept, prescribe" },
    { route: "/ov-staff/report", label: "Online visit report", icon: BarChart3, color: "from-violet-600 to-fuchsia-700", desc: "Requests, fees, refunds" },
  ] },
  { label: "Finance", items: [
    { route: "/finance", label: "Finance overview", icon: TrendingUp, color: "from-indigo-600 to-violet-700", desc: "Revenue, refunds, expenses, payers" },
    { route: "/panels", label: "Panels & insurers", icon: Building2, color: "from-indigo-600 to-sky-600", desc: "Coverage, statements, payments" },
    { route: "/claims", label: "Insurance claims", icon: FileCheck2, color: "from-sky-600 to-indigo-700", desc: "Submit, query, settle, deductions" },
    { route: "/online-payments", label: "Online card payments", icon: CreditCard, color: "from-indigo-600 to-sky-600", desc: "Payment links, card payments (test mode)" },
    { route: "/fbr", label: "FBR reporting", icon: FileCheck2, color: "from-emerald-700 to-green-800", desc: "Day-end FBR report, FBR numbers" },
    { route: "/welfare", label: "Welfare & zakat", icon: HandHeart, color: "from-emerald-600 to-teal-700", desc: "Schemes, approvals, donations, funds" },
    { route: "/expenses", label: "Expenses", icon: ReceiptText, color: "from-orange-500 to-rose-600", desc: "Bills with receipt and approvals" },
    { route: "/purchase_order", label: "Purchase orders", icon: ShoppingCart, color: "from-amber-600 to-orange-700", desc: "Approve and track orders" },
    { route: "/purchase_invoice", label: "Purchase invoices", icon: FileText, color: "from-amber-700 to-red-700", desc: "Supplier bills, unpaid" },
  ] },
  { label: "Billing", items: [
    { route: "/doctor-share", label: "Doctor share", icon: HandCoins, color: "from-sky-600 to-emerald-600", desc: "Commission, owed / paid, payouts" },
    { route: "/my-share", label: "My commission", icon: HandCoins, color: "from-teal-600 to-sky-600", desc: "Your commission statement" },
    { route: "/billing/discount-approvals", label: "Discount approvals", icon: Percent, color: "from-orange-500 to-amber-500", desc: "Requests above the limit" },
    { route: "/messages", label: "Message log", icon: MessagesSquare, color: "from-green-600 to-teal-600", desc: "WhatsApp / SMS delivery" },
  ] },
  { label: "Insights", items: [
    { route: "/pw-dashboard", label: "Dashboard", icon: LayoutDashboard, color: "from-indigo-500 to-blue-600", desc: "Today at a glance" },
    { route: "/reports", label: "Reports", icon: BarChart3, color: "from-blue-500 to-sky-600", desc: "MIS reports" },
    { route: "/feedback", label: "Patient feedback", icon: MessageSquareHeart, color: "from-pink-500 to-rose-600", desc: "Ratings and follow-ups" },
  ] },
  { label: "Admin", items: [
    { route: "/doctors", label: "Doctors", icon: Activity, color: "from-teal-600 to-cyan-700", desc: "Doctors, schedules, leave" },
    { route: "/patients/merge", label: "Merge patients", icon: Merge, color: "from-stone-500 to-stone-700", desc: "Merge duplicate records" },
    { route: "/audit", label: "Audit log", icon: ShieldCheck, color: "from-zinc-600 to-zinc-800", desc: "Who saw what, and changes" },
    { route: "/settings", label: "Clinic settings", icon: Settings, color: "from-gray-500 to-gray-700", desc: "Modules, billing, messaging" },
    { route: "/display/devices", label: "Display devices", icon: MonitorSmartphone, color: "from-cyan-600 to-teal-700", desc: "Counter and queue screens" },
  ] },
];

export const HOME: NavItem = { route: "/pw-home", label: "Control board", icon: LayoutGrid, color: "", desc: "" };
export const ICONS = { ScrollText, FileClock };
