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
const DoctorsPage = lazy(() => import("@/modules/admin/DoctorsPage"));
const CashShiftPage = lazy(() => import("@/modules/cash/ShiftPage"));
const CashClosePage = lazy(() => import("@/modules/cash/ClosePage"));
const CashApprovalsPage = lazy(() => import("@/modules/cash/ApprovalsPage"));
const CashReportsPage = lazy(() => import("@/modules/cash/ReportsPage"));
const LabOrdersPage = lazy(() => import("@/modules/lab/OrdersPage"));
const LabSamplesPage = lazy(() => import("@/modules/lab/SamplesPage"));
const LabTestsPage = lazy(() => import("@/modules/lab/TestsPage"));
const LabVerifyPage = lazy(() => import("@/modules/lab/VerifyPage"));
const LabOutsourcedPage = lazy(() => import("@/modules/lab/OutsourcedPage"));
const LabReportPage = lazy(() => import("@/modules/public/LabReportPage"));
const PosPage = lazy(() => import("@/modules/pharmacy/PosPage"));
const PickPage = lazy(() => import("@/modules/pharmacy/PipelinePages").then((m) => ({ default: m.PickPage })));
const ReviewPage = lazy(() => import("@/modules/pharmacy/PipelinePages").then((m) => ({ default: m.ReviewPage })));
const DispensePage = lazy(() => import("@/modules/pharmacy/PipelinePages").then((m) => ({ default: m.DispensePage })));
const TicketsPage = lazy(() => import("@/modules/pharmacy/PipelinePages").then((m) => ({ default: m.TicketsPage })));
const ItemsPage = lazy(() => import("@/modules/pharmacy/StorePages").then((m) => ({ default: m.ItemsPage })));
const ReceivePage = lazy(() => import("@/modules/pharmacy/StorePages").then((m) => ({ default: m.ReceivePage })));
const TransfersPage = lazy(() => import("@/modules/pharmacy/StorePages").then((m) => ({ default: m.TransfersPage })));
const ReturnsPage = lazy(() => import("@/modules/pharmacy/StorePages").then((m) => ({ default: m.ReturnsPage })));
const CycleCountPage = lazy(() => import("@/modules/pharmacy/StorePages").then((m) => ({ default: m.CycleCountPage })));
const PharmacyReportsPage = lazy(() => import("@/modules/pharmacy/StorePages").then((m) => ({ default: m.PharmacyReportsPage })));
const DevicePage = lazy(() => import("@/modules/display/DevicePage"));
const DevicesPage = lazy(() => import("@/modules/display/DevicesPage"));
const ComingPage = lazy(() => import("@/modules/home/ComingPage"));
const AdmissionsPage = lazy(() => import("@/modules/ipd/AdmissionsPage"));
const ChartPage = lazy(() => import("@/modules/ipd/ChartPage"));
const MarPage = lazy(() => import("@/modules/ipd/MarPage"));
const IpdBillPage = lazy(() => import("@/modules/ipd/BillPage"));
const KitchenPage = lazy(() => import("@/modules/ipd/MorePages").then((m) => ({ default: m.KitchenPage })));
const PreAuthPage = lazy(() => import("@/modules/ipd/MorePages").then((m) => ({ default: m.PreAuthPage })));
const IpdReportPage = lazy(() => import("@/modules/ipd/MorePages").then((m) => ({ default: m.ReportPage })));
const RosterPage = lazy(() => import("@/modules/ipd/RosterPage"));
const ErBoardPage = lazy(() => import("@/modules/er/ErBoardPage"));
const CounterPage = lazy(() => import("@/modules/counter/CounterPage"));
const CounterDisplayPage = lazy(() => import("@/modules/counter/DisplayPage"));
const PharmacyDisplayPage = lazy(() => import("@/modules/pharmacy/DisplayPage"));
const DoctorSharePage = lazy(() => import("@/modules/billing/DoctorSharePage"));
const PatientRoomPage = lazy(() => import("@/modules/comms/PatientRoomPage"));
const StationListPage = lazy(() => import("@/modules/comms/StationPages"));
const NursingStationPage = lazy(() => import("@/modules/comms/StationPages").then((m) => ({ default: m.NursingStationPage })));
const AssignPage = lazy(() => import("@/modules/comms/StationPages").then((m) => ({ default: m.AssignPage })));
const ResponseReportPage = lazy(() => import("@/modules/comms/StationPages").then((m) => ({ default: m.ResponseReportPage })));
const FeedbackAdminPage = lazy(() => import("@/modules/comms/FeedbackPages"));
const fin = (n: string) => lazy(() => import("@/modules/finance/FinancePages").then((m) => ({ default: (m as unknown as Record<string, React.ComponentType>)[n] })));
const WelfarePage = fin("WelfarePage");
const PanelsPage = fin("PanelsPage");
const ClaimsPage = fin("ClaimsPage");
const ExpensesPage = fin("ExpensesPage");
const FinanceOverviewPage = fin("FinanceOverviewPage");
const CheckoutPage = lazy(() => import("@/modules/finance/PaymentsPages").then((m) => ({ default: m.CheckoutPage })));
const OnlinePaymentsPage = lazy(() => import("@/modules/finance/PaymentsPages").then((m) => ({ default: m.OnlinePaymentsPage })));
const FbrPage = lazy(() => import("@/modules/finance/PaymentsPages").then((m) => ({ default: m.FbrPage })));
const LabTemplatesPage = lazy(() => import("@/modules/lab/TemplatesPage"));
const PurchasingPage = lazy(() => import("@/modules/finance/FinancePages").then((m) => ({ default: m.PurchasingPage })));
const FeedbackFormPage = lazy(() => import("@/modules/comms/FeedbackPages").then((m) => ({ default: m.FeedbackFormPage })));
const MySharePage = lazy(() => import("@/modules/billing/DoctorSharePage").then((m) => ({ default: m.MySharePage })));
const OnlineVisitPage = lazy(() => import("@/modules/public/OnlineVisitPage"));
const OnlineVisitStatusPage = lazy(() => import("@/modules/public/OnlineVisitStatusPage"));
const OvStaffPage = lazy(() => import("@/modules/ov/OvStaffPage"));
const OvReportPage = lazy(() => import("@/modules/ov/OvStaffPage").then((m) => ({ default: m.OvReportPage })));

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
        <Route path="/lab-report/:token" element={<LabReportPage />} />
        <Route path="/patient/:token" element={<PatientRoomPage />} />
        <Route path="/feedback/:token" element={<FeedbackFormPage />} />
        <Route path="/pay/:token" element={<CheckoutPage />} />
        <Route path="/online-visit" element={<OnlineVisitPage />} />
        <Route path="/online-visit/:token" element={<OnlineVisitStatusPage />} />
        <Route path="/display/counter/:key" element={<DevicePage />} />
        <Route path="/display/pharmacy/:key" element={<DevicePage />} />
        <Route path="/display/waiting/:key" element={<DevicePage />} />
        <Route path="/display/beds/:key" element={<DevicePage />} />
        <Route path="/" element={loading ? <Loading /> : <Navigate to={boot ? "/pw-home" : "/login"} replace />} />
        <Route path="/pw-home" element={g("/pw-home", <HomePage />)} />
        <Route path="/pw-dashboard" element={g("/pw-dashboard", <DashboardPage />)} />
        <Route path="/registration" element={g("/registration", <RegistrationPage />)} />
        <Route path="/patients" element={g("/patients", <PatientsPage />)} />
        <Route path="/patients/merge" element={g("/patients/merge", <MergePage />)} />
        <Route path="/patients/:mr" element={g("/patients", <PatientDetailPage />)} />
        <Route path="/opd_slip" element={g("/opd_slip", <OpdSlipPage />)} />
        <Route path="/counter" element={g("/counter", <CounterPage />)} />
        <Route path="/counter/display" element={g("/counter", <CounterDisplayPage />, true)} />
        <Route path="/medicine_invoice/display" element={g("/medicine_invoice", <PharmacyDisplayPage />, true)} />
        <Route path="/physician-queue" element={g("/physician-queue", <QueuePage />)} />
        <Route path="/display/queue" element={g("/physician-queue", <QueueDisplayPage />, true)} />
        <Route path="/pw-prescription" element={g("/pw-prescription", <PrescriptionPage />)} />
        <Route path="/pw-history" element={g("/pw-history", <HistoryPage />)} />
        <Route path="/pw-history/:mr" element={g("/pw-history", <HistoryPage />)} />
        <Route path="/appointments" element={g("/appointments", <AppointmentsPage />)} />
        <Route path="/appointments/inbox" element={g("/appointments/inbox", <InboxPage />)} />
        <Route path="/ward" element={g("/ward", <WardPage />)} />
        <Route path="/ipd" element={g("/ipd", <AdmissionsPage />)} />
        <Route path="/ipd/mar" element={g("/ipd/mar", <MarPage />)} />
        <Route path="/ipd/kitchen" element={g("/ipd/kitchen", <KitchenPage />)} />
        <Route path="/ipd/pre-auth" element={g("/ipd/pre-auth", <PreAuthPage />)} />
        <Route path="/ipd/:name" element={g("/ipd", <ChartPage />)} />
        <Route path="/ipd_slip" element={g("/ipd_slip", <IpdBillPage />)} />
        <Route path="/ipd_report" element={g("/ipd_report", <IpdReportPage />)} />
        <Route path="/roster" element={g("/roster", <RosterPage />)} />
        <Route path="/display/ward" element={g("/display/ward", <WardKioskPage />, true)} />
        <Route path="/billing/discount-approvals" element={g("/billing/discount-approvals", <DiscountApprovalsPage />)} />
        <Route path="/messages" element={g("/messages", <MessagesPage />)} />
        <Route path="/reports" element={g("/reports", <ReportsPage />)} />
        <Route path="/reports/:report" element={g("/reports", <ReportsPage />)} />
        <Route path="/audit" element={g("/audit", <AuditPage />)} />
        <Route path="/settings" element={g("/settings", <SettingsPage />)} />
        <Route path="/masters" element={g("/masters", <MastersPage />)} />
        <Route path="/masters/:kind" element={g("/masters", <MastersPage />)} />
        <Route path="/doctors" element={g("/doctors", <DoctorsPage />)} />
        <Route path="/cash/shift" element={g("/cash/shift", <CashShiftPage />)} />
        <Route path="/cash/close" element={g("/cash/close", <CashClosePage />)} />
        <Route path="/cash/approvals" element={g("/cash/approvals", <CashApprovalsPage />)} />
        <Route path="/cash/reports" element={g("/cash/reports", <CashReportsPage />)} />
        <Route path="/doctor-share" element={g("/doctor-share", <DoctorSharePage />)} />
        <Route path="/my-share" element={g("/my-share", <MySharePage />)} />
        <Route path="/ns" element={g("/ns", <StationListPage />)} />
        <Route path="/ns/:station" element={g("/ns/:station", <NursingStationPage />)} />
        <Route path="/pc-assign" element={g("/pc-assign", <AssignPage />)} />
        <Route path="/pc-report" element={g("/pc-report", <ResponseReportPage />)} />
        <Route path="/feedback" element={g("/feedback", <FeedbackAdminPage />)} />
        <Route path="/lab/templates" element={g("/lab/templates", <LabTemplatesPage />)} />
        <Route path="/welfare" element={g("/welfare", <WelfarePage />)} />
        <Route path="/panels" element={g("/panels", <PanelsPage />)} />
        <Route path="/claims" element={g("/claims", <ClaimsPage />)} />
        <Route path="/expenses" element={g("/expenses", <ExpensesPage />)} />
        <Route path="/finance" element={g("/finance", <FinanceOverviewPage />)} />
        <Route path="/online-payments" element={g("/online-payments", <OnlinePaymentsPage />)} />
        <Route path="/fbr" element={g("/fbr", <FbrPage />)} />
        <Route path="/purchase_order" element={g("/purchase_order", <PurchasingPage doctype="Purchase Order" />)} />
        <Route path="/purchase_invoice" element={g("/purchase_invoice", <PurchasingPage doctype="Purchase Invoice" />)} />
        <Route path="/lab/orders" element={g("/lab/orders", <LabOrdersPage />)} />
        <Route path="/lab/samples" element={g("/lab/samples", <LabSamplesPage />)} />
        <Route path="/tests" element={g("/tests", <LabTestsPage />)} />
        <Route path="/lab/verify" element={g("/lab/verify", <LabVerifyPage />)} />
        <Route path="/lab/outsourced" element={g("/lab/outsourced", <LabOutsourcedPage />)} />
        <Route path="/medicine_invoice" element={g("/medicine_invoice", <PosPage />)} />
        <Route path="/pharmacy/pick" element={g("/pharmacy/pick", <PickPage />)} />
        <Route path="/pharmacy/review" element={g("/pharmacy/review", <ReviewPage />)} />
        <Route path="/pharmacy/dispense" element={g("/pharmacy/dispense", <DispensePage />)} />
        <Route path="/pharmacy/tickets" element={g("/pharmacy/tickets", <TicketsPage />)} />
        <Route path="/pharmacy/items" element={g("/pharmacy/items", <ItemsPage />)} />
        <Route path="/pharmacy/reports" element={g("/pharmacy/reports", <PharmacyReportsPage />)} />
        <Route path="/store/receive" element={g("/store/receive", <ReceivePage />)} />
        <Route path="/store/transfers" element={g("/store/transfers", <TransfersPage />)} />
        <Route path="/store/returns" element={g("/store/returns", <ReturnsPage />)} />
        <Route path="/store/cycle-count" element={g("/store/cycle-count", <CycleCountPage />)} />
        <Route path="/display/devices" element={g("/display/devices", <DevicesPage />)} />
        <Route path="/er" element={g("/er", <ErBoardPage />)} />
        <Route path="/ov-staff" element={g("/ov-staff", <OvStaffPage />)} />
        <Route path="/ov-staff/report" element={g("/ov-staff/report", <OvReportPage />)} />
        <Route path="*" element={g("/pw-home", <ComingPage title="This screen" phase={4} />)} />
      </Routes>
    </Suspense>
  );
}
