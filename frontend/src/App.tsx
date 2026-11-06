import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/skeleton";

const LoginPage = lazy(() => import("@/modules/auth/LoginPage"));
const HomePage = lazy(() => import("@/modules/home/HomePage"));
const DashboardPage = lazy(() => import("@/modules/dashboard/DashboardPage"));
const RegistrationPage = lazy(() => import("@/modules/patients/RegistrationPage"));
const PatientsPage = lazy(() => import("@/modules/patients/PatientsPage"));
const PatientDetailPage = lazy(() => import("@/modules/patients/PatientDetailPage"));
const MergePage = lazy(() => import("@/modules/patients/MergePage"));
const OpdSlipPage = lazy(() => import("@/modules/opd/OpdSlipPage"));
const QueuePage = lazy(() => import("@/modules/opd/QueuePage"));
const QueueDisplayPage = lazy(() => import("@/modules/opd/QueueDisplayPage"));
const PrescriptionPage = lazy(() => import("@/modules/opd/PrescriptionPage"));
const HistoryPage = lazy(() => import("@/modules/opd/HistoryPage"));
const AppointmentsPage = lazy(() => import("@/modules/appointments/AppointmentsPage"));
const InboxPage = lazy(() => import("@/modules/appointments/InboxPage"));
const BookPage = lazy(() => import("@/modules/public/BookPage"));
const ManagePage = lazy(() => import("@/modules/public/ManagePage"));
const WardPage = lazy(() => import("@/modules/ward/WardPage"));
const WardKioskPage = lazy(() => import("@/modules/ward/WardKioskPage"));
const DiscountApprovalsPage = lazy(() => import("@/modules/billing/DiscountApprovalsPage"));
const MessagesPage = lazy(() => import("@/modules/billing/MessagesPage"));
const ReportsPage = lazy(() => import("@/modules/reports/ReportsPage"));
const AuditPage = lazy(() => import("@/modules/admin/AuditPage"));
const SettingsPage = lazy(() => import("@/modules/admin/SettingsPage"));
const MastersPage = lazy(() => import("@/modules/admin/MastersPage"));
const ComingPage = lazy(() => import("@/modules/home/ComingPage"));

function Loading() {
  return <div className="flex h-full min-h-[50vh] items-center justify-center"><Spinner size={28} /></div>;
}

/** Staff route: signed in + allowed by Page Access Rules (the server enforces it again on every call). */
function Guard({ route, children, bare }: { route: string; children: ReactNode; bare?: boolean }) {
  const { boot, loading, can } = useAuth();
  const loc = useLocation();
  const { t } = useTranslation();
  if (loading) return <Loading />;
  if (!boot) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  const body = can(route) ? children : (
    <div className="mx-auto mt-20 max-w-md text-center"><ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-500" />
      <h2 className="text-lg font-bold">{t("No access")}</h2><p className="text-sm text-muted-foreground">Your role cannot open {route}. Ask the administrator.</p></div>
  );
  return bare ? <>{body}</> : <AppShell><Suspense fallback={<Loading />}>{body}</Suspense></AppShell>;
}

const g = (route: string, el: ReactNode, bare = false) => <Guard route={route} bare={bare}>{el}</Guard>;

export default function App() {
  const { boot, loading } = useAuth();
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pw-login" element={<Navigate to="/login" replace />} />
        <Route path="/book-appointment" element={<BookPage />} />
        <Route path="/my-appointment/:token" element={<ManagePage />} />
        <Route path="/" element={loading ? <Loading /> : <Navigate to={boot ? "/pw-home" : "/login"} replace />} />
        <Route path="/pw-home" element={g("/pw-home", <HomePage />)} />
        <Route path="/pw-dashboard" element={g("/pw-dashboard", <DashboardPage />)} />
        <Route path="/registration" element={g("/registration", <RegistrationPage />)} />
        <Route path="/patients" element={g("/patients", <PatientsPage />)} />
        <Route path="/patients/merge" element={g("/patients/merge", <MergePage />)} />
        <Route path="/patients/:mr" element={g("/patients", <PatientDetailPage />)} />
        <Route path="/opd_slip" element={g("/opd_slip", <OpdSlipPage />)} />
        <Route path="/physician-queue" element={g("/physician-queue", <QueuePage />)} />
        <Route path="/display/queue" element={g("/physician-queue", <QueueDisplayPage />, true)} />
        <Route path="/pw-prescription" element={g("/pw-prescription", <PrescriptionPage />)} />
        <Route path="/pw-history" element={g("/pw-history", <HistoryPage />)} />
        <Route path="/pw-history/:mr" element={g("/pw-history", <HistoryPage />)} />
        <Route path="/appointments" element={g("/appointments", <AppointmentsPage />)} />
        <Route path="/appointments/inbox" element={g("/appointments/inbox", <InboxPage />)} />
        <Route path="/ward" element={g("/ward", <WardPage />)} />
        <Route path="/ipd" element={<Navigate to="/ward" replace />} />
        <Route path="/display/ward" element={g("/display/ward", <WardKioskPage />, true)} />
        <Route path="/billing/discount-approvals" element={g("/billing/discount-approvals", <DiscountApprovalsPage />)} />
        <Route path="/messages" element={g("/messages", <MessagesPage />)} />
        <Route path="/reports" element={g("/reports", <ReportsPage />)} />
        <Route path="/reports/:report" element={g("/reports", <ReportsPage />)} />
        <Route path="/audit" element={g("/audit", <AuditPage />)} />
        <Route path="/settings" element={g("/settings", <SettingsPage />)} />
        <Route path="/masters" element={g("/masters", <MastersPage />)} />
        <Route path="/masters/:kind" element={g("/masters", <MastersPage />)} />
        <Route path="/doctors" element={g("/doctors", <MastersPage fixed="doctors" />)} />
        <Route path="/er" element={g("/er", <ComingPage title="Emergency" phase={3} />)} />
        <Route path="*" element={g("/pw-home", <ComingPage title="This screen" phase={2} />)} />
      </Routes>
    </Suspense>
  );
}
