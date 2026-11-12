/**
 * Routes of the accounting and buying screens ported from sugarcane (D-65), mounted inside AccLayout (FrappeProvider + the
 * sugarcane auth / company context) and guarded by the hospital's page access ("/accounting" or "/buying").
 */
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";

const AccountCategoriesPage = lazy(() => import("@/acc/pages/Accounting/AccountCategoriesPage").then((m) => ({ default: m.AccountCategoriesPage })));
const AccountingDimensionsPage = lazy(() => import("@/acc/pages/Accounting/AccountingDimensionsPage").then((m) => ({ default: m.AccountingDimensionsPage })));
const AccountsSettingsPage = lazy(() => import("@/acc/pages/Accounting/AccountsSettingsPage").then((m) => ({ default: m.AccountsSettingsPage })));
const BankClearancePage = lazy(() => import("@/acc/pages/Accounting/BankClearancePage"));
const BankingDoc = lazy(() => import("@/acc/pages/Accounting/BankingDocPage"));
const BuyingSettingsPage = lazy(() => import("@/acc/pages/Purchase/BuyingSettingsPage").then((m) => ({ default: m.BuyingSettingsPage })));
const ChartOfAccountsPage = lazy(() => import("@/acc/pages/Accounting/ChartOfAccountsPage").then((m) => ({ default: m.ChartOfAccountsPage })));
const ChequeTrackingPage = lazy(() => import("@/acc/pages/Accounting/ChequeTrackingPage"));
const CostCentersPage = lazy(() => import("@/acc/pages/Accounting/CostCentersPage").then((m) => ({ default: m.CostCentersPage })));
const FiscalYearsPage = lazy(() => import("@/acc/pages/Accounting/FiscalYearsPage").then((m) => ({ default: m.FiscalYearsPage })));
const GettingStartedPage = lazy(() => import("@/acc/pages/Accounting/GettingStartedPage").then((m) => ({ default: m.GettingStartedPage })));
const JournalEntriesPage = lazy(() => import("@/acc/pages/Accounting/JournalEntriesPage").then((m) => ({ default: m.JournalEntriesPage })));
const JournalEntryFormPage = lazy(() => import("@/acc/pages/Accounting/JournalEntryFormPage").then((m) => ({ default: m.JournalEntryFormPage })));
const JournalEntryTemplatePage = lazy(() => import("@/acc/pages/Accounting/JournalEntryTemplatePage").then((m) => ({ default: m.JournalEntryTemplatePage })));
const LandedCostVoucherDetailPage = lazy(() => import("@/acc/pages/Purchase/LandedCostVoucherDetailPage").then((m) => ({ default: m.LandedCostVoucherDetailPage })));
const LandedCostVoucherFormPage = lazy(() => import("@/acc/pages/Purchase/LandedCostVoucherFormPage").then((m) => ({ default: m.LandedCostVoucherFormPage })));
const LandedCostVouchersPage = lazy(() => import("@/acc/pages/Purchase/LandedCostVouchersPage").then((m) => ({ default: m.LandedCostVouchersPage })));
const MaterialRequestDetailPage = lazy(() => import("@/acc/pages/Import/MaterialRequestDetailPage").then((m) => ({ default: m.MaterialRequestDetailPage })));
const MaterialRequestFormPage = lazy(() => import("@/acc/pages/Import/MaterialRequestFormPage").then((m) => ({ default: m.MaterialRequestFormPage })));
const MaterialRequestsPage = lazy(() => import("@/acc/pages/Import/MaterialRequestsPage").then((m) => ({ default: m.MaterialRequestsPage })));
const ModeOfPaymentPage = lazy(() => import("@/acc/pages/Accounting/ModeOfPaymentPage").then((m) => ({ default: m.ModeOfPaymentPage })));
const PaymentEntriesPage = lazy(() => import("@/acc/pages/Accounting/PaymentEntriesPage").then((m) => ({ default: m.PaymentEntriesPage })));
const PaymentEntryFormPage = lazy(() => import("@/acc/pages/Accounting/PaymentEntryFormPage").then((m) => ({ default: m.PaymentEntryFormPage })));
const PaymentTermsPage = lazy(() => import("@/acc/pages/Accounting/PaymentTermsPage").then((m) => ({ default: m.PaymentTermsPage })));
const PurchaseInvoiceDetailPage = lazy(() => import("@/acc/pages/Purchase/PurchaseInvoiceDetailPage").then((m) => ({ default: m.PurchaseInvoiceDetailPage })));
const PurchaseInvoiceFormPage = lazy(() => import("@/acc/pages/Purchase/PurchaseInvoiceFormPage").then((m) => ({ default: m.PurchaseInvoiceFormPage })));
const PurchaseInvoicesPage = lazy(() => import("@/acc/pages/Purchase/PurchaseInvoicesPage").then((m) => ({ default: m.PurchaseInvoicesPage })));
const PurchaseOrderDetailPage = lazy(() => import("@/acc/pages/Import/PurchaseOrderDetailPage").then((m) => ({ default: m.PurchaseOrderDetailPage })));
const PurchaseOrderFormPage = lazy(() => import("@/acc/pages/Import/PurchaseOrderFormPage").then((m) => ({ default: m.PurchaseOrderFormPage })));
const PurchaseOrdersPage = lazy(() => import("@/acc/pages/Import/PurchaseOrdersPage").then((m) => ({ default: m.PurchaseOrdersPage })));
const PurchaseReceiptDetailPage = lazy(() => import("@/acc/pages/Purchase/PurchaseReceiptDetailPage").then((m) => ({ default: m.PurchaseReceiptDetailPage })));
const PurchaseReceiptFormPage = lazy(() => import("@/acc/pages/Purchase/PurchaseReceiptFormPage").then((m) => ({ default: m.PurchaseReceiptFormPage })));
const PurchaseReceiptsPage = lazy(() => import("@/acc/pages/Purchase/PurchaseReceiptsPage").then((m) => ({ default: m.PurchaseReceiptsPage })));
const ReportBalanceSheetPage = lazy(() => import("@/acc/pages/Accounting/ReportBalanceSheetPage").then((m) => ({ default: m.ReportBalanceSheetPage })));
const ReportCashFlowPage = lazy(() => import("@/acc/pages/Accounting/ReportCashFlowPage").then((m) => ({ default: m.ReportCashFlowPage })));
const ReportGeneralLedgerPage = lazy(() => import("@/acc/pages/Accounting/ReportGeneralLedgerPage").then((m) => ({ default: m.ReportGeneralLedgerPage })));
const ReportProfitAndLossPage = lazy(() => import("@/acc/pages/Accounting/ReportProfitAndLossPage").then((m) => ({ default: m.ReportProfitAndLossPage })));
const ReportTrialBalancePage = lazy(() => import("@/acc/pages/Accounting/ReportTrialBalancePage").then((m) => ({ default: m.ReportTrialBalancePage })));
const RequestForQuotationDetailPage = lazy(() => import("@/acc/pages/Import/RequestForQuotationDetailPage").then((m) => ({ default: m.RequestForQuotationDetailPage })));
const RequestForQuotationFormPage = lazy(() => import("@/acc/pages/Import/RequestForQuotationFormPage").then((m) => ({ default: m.RequestForQuotationFormPage })));
const RequestForQuotationsPage = lazy(() => import("@/acc/pages/Import/RequestForQuotationsPage").then((m) => ({ default: m.RequestForQuotationsPage })));
const SupplierFormPage = lazy(() => import("@/acc/pages/Masters/SupplierFormPage").then((m) => ({ default: m.SupplierFormPage })));
const SupplierGroupFormPage = lazy(() => import("@/acc/pages/Masters/SupplierGroupFormPage").then((m) => ({ default: m.SupplierGroupFormPage })));
const SupplierGroupsPage = lazy(() => import("@/acc/pages/Masters/SupplierGroupsPage").then((m) => ({ default: m.SupplierGroupsPage })));
const SupplierQuotationPage = lazy(() => import("@/acc/pages/Import/SupplierQuotationPages").then((m) => ({ default: m.SupplierQuotationPage })));
const SupplierQuotationsPage = lazy(() => import("@/acc/pages/Import/SupplierQuotationPages").then((m) => ({ default: m.SupplierQuotationsPage })));
const SuppliersPage = lazy(() => import("@/acc/pages/Masters/SuppliersPage").then((m) => ({ default: m.SuppliersPage })));
const TaxTemplatesPage = lazy(() => import("@/acc/pages/Accounting/TaxTemplatesPage").then((m) => ({ default: m.TaxTemplatesPage })));
const TermsAndConditionsPage = lazy(() => import("@/acc/pages/Accounting/TermsAndConditionsPage").then((m) => ({ default: m.TermsAndConditionsPage })));

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-muted" />}>{children}</Suspense>;

export function accRoutes(g: (route: string, el: ReactNode) => ReactNode) {
  return [
      <Route key="/import/material-requests" path="/import/material-requests" element={g("/purchase", <S><MaterialRequestsPage /></S>)} />,
      <Route key="/import/material-requests/new" path="/import/material-requests/new" element={g("/purchase", <S><MaterialRequestFormPage /></S>)} />,
      <Route key="/import/material-requests/:name" path="/import/material-requests/:name" element={g("/purchase", <S><MaterialRequestDetailPage /></S>)} />,
      <Route key="/import/material-requests/:name/edit" path="/import/material-requests/:name/edit" element={g("/purchase", <S><MaterialRequestFormPage /></S>)} />,
      <Route key="/import/rfqs" path="/import/rfqs" element={g("/purchase", <S><RequestForQuotationsPage /></S>)} />,
      <Route key="/import/rfqs/new" path="/import/rfqs/new" element={g("/purchase", <S><RequestForQuotationFormPage /></S>)} />,
      <Route key="/import/rfqs/:name" path="/import/rfqs/:name" element={g("/purchase", <S><RequestForQuotationDetailPage /></S>)} />,
      <Route key="/import/rfqs/:name/edit" path="/import/rfqs/:name/edit" element={g("/purchase", <S><RequestForQuotationFormPage /></S>)} />,
      <Route key="/purchase/settings" path="/purchase/settings" element={g("/purchase", <S><BuyingSettingsPage /></S>)} />,
      <Route key="/import/purchase-orders" path="/import/purchase-orders" element={g("/purchase", <S><PurchaseOrdersPage /></S>)} />,
      <Route key="/import/purchase-orders/new" path="/import/purchase-orders/new" element={g("/purchase", <S><PurchaseOrderFormPage /></S>)} />,
      <Route key="/import/purchase-orders/:name" path="/import/purchase-orders/:name" element={g("/purchase", <S><PurchaseOrderDetailPage /></S>)} />,
      <Route key="/import/purchase-orders/:name/edit" path="/import/purchase-orders/:name/edit" element={g("/purchase", <S><PurchaseOrderFormPage /></S>)} />,
      <Route key="/purchase/receipts" path="/purchase/receipts" element={g("/purchase", <S><PurchaseReceiptsPage /></S>)} />,
      <Route key="/purchase/receipts/new" path="/purchase/receipts/new" element={g("/purchase", <S><PurchaseReceiptFormPage /></S>)} />,
      <Route key="/purchase/receipts/:name" path="/purchase/receipts/:name" element={g("/purchase", <S><PurchaseReceiptDetailPage /></S>)} />,
      <Route key="/purchase/receipts/:name/edit" path="/purchase/receipts/:name/edit" element={g("/purchase", <S><PurchaseReceiptFormPage /></S>)} />,
      <Route key="/purchase/invoices" path="/purchase/invoices" element={g("/purchase", <S><PurchaseInvoicesPage /></S>)} />,
      <Route key="/purchase/invoices/new" path="/purchase/invoices/new" element={g("/purchase", <S><PurchaseInvoiceFormPage /></S>)} />,
      <Route key="/purchase/invoices/:name" path="/purchase/invoices/:name" element={g("/purchase", <S><PurchaseInvoiceDetailPage /></S>)} />,
      <Route key="/purchase/invoices/:name/edit" path="/purchase/invoices/:name/edit" element={g("/purchase", <S><PurchaseInvoiceFormPage /></S>)} />,
      <Route key="/purchase/landed-costs" path="/purchase/landed-costs" element={g("/purchase", <S><LandedCostVouchersPage /></S>)} />,
      <Route key="/purchase/landed-costs/new" path="/purchase/landed-costs/new" element={g("/purchase", <S><LandedCostVoucherFormPage /></S>)} />,
      <Route key="/purchase/landed-costs/:name" path="/purchase/landed-costs/:name" element={g("/purchase", <S><LandedCostVoucherDetailPage /></S>)} />,
      <Route key="/purchase/landed-costs/:name/edit" path="/purchase/landed-costs/:name/edit" element={g("/purchase", <S><LandedCostVoucherFormPage /></S>)} />,
      <Route key="/masters/suppliers" path="/masters/suppliers" element={g("/purchase", <S><SuppliersPage /></S>)} />,
      <Route key="/masters/suppliers/new" path="/masters/suppliers/new" element={g("/purchase", <S><SupplierFormPage /></S>)} />,
      <Route key="/masters/suppliers/:name" path="/masters/suppliers/:name" element={g("/purchase", <S><SupplierFormPage /></S>)} />,
      <Route key="/masters/supplier-groups" path="/masters/supplier-groups" element={g("/purchase", <S><SupplierGroupsPage /></S>)} />,
      <Route key="/masters/supplier-groups/new" path="/masters/supplier-groups/new" element={g("/purchase", <S><SupplierGroupFormPage /></S>)} />,
      <Route key="/masters/supplier-groups/:name" path="/masters/supplier-groups/:name" element={g("/purchase", <S><SupplierGroupFormPage /></S>)} />,
      <Route key="/accounting" path="/accounting" element={<Navigate to="/finance" replace />} />,
      <Route key="/accounting/banks" path="/accounting/banks" element={g("/accounting", <S><BankingDoc which="bank" /></S>)} />,
      <Route key="/accounting/banks/:name" path="/accounting/banks/:name" element={g("/accounting", <S><BankingDoc which="bank" form /></S>)} />,
      <Route key="/accounting/bank-accounts" path="/accounting/bank-accounts" element={g("/accounting", <S><BankingDoc which="bankAccount" /></S>)} />,
      <Route key="/accounting/bank-accounts/:name" path="/accounting/bank-accounts/:name" element={g("/accounting", <S><BankingDoc which="bankAccount" form /></S>)} />,
      <Route key="/accounting/cheque-books" path="/accounting/cheque-books" element={g("/accounting", <S><BankingDoc which="chequeBook" /></S>)} />,
      <Route key="/accounting/cheque-books/:name" path="/accounting/cheque-books/:name" element={g("/accounting", <S><BankingDoc which="chequeBook" form /></S>)} />,
      <Route key="/accounting/cheque-tracking" path="/accounting/cheque-tracking" element={g("/accounting", <S><ChequeTrackingPage /></S>)} />,
      <Route key="/accounting/bank-clearance" path="/accounting/bank-clearance" element={g("/accounting", <S><BankClearancePage /></S>)} />,
      <Route key="/accounting/getting-started" path="/accounting/getting-started" element={g("/accounting", <S><GettingStartedPage /></S>)} />,
      <Route key="/accounting/chart-of-accounts" path="/accounting/chart-of-accounts" element={g("/accounting", <S><ChartOfAccountsPage /></S>)} />,
      <Route key="/accounting/cost-centers" path="/accounting/cost-centers" element={g("/accounting", <S><CostCentersPage /></S>)} />,
      <Route key="/accounting/account-categories" path="/accounting/account-categories" element={g("/accounting", <S><AccountCategoriesPage /></S>)} />,
      <Route key="/accounting/fiscal-years" path="/accounting/fiscal-years" element={g("/accounting", <S><FiscalYearsPage /></S>)} />,
      <Route key="/accounting/payment-terms" path="/accounting/payment-terms" element={g("/accounting", <S><PaymentTermsPage /></S>)} />,
      <Route key="/accounting/mode-of-payment" path="/accounting/mode-of-payment" element={g("/accounting", <S><ModeOfPaymentPage /></S>)} />,
      <Route key="/accounting/terms-and-conditions" path="/accounting/terms-and-conditions" element={g("/accounting", <S><TermsAndConditionsPage /></S>)} />,
      <Route key="/accounting/journal-entry-templates" path="/accounting/journal-entry-templates" element={g("/accounting", <S><JournalEntryTemplatePage /></S>)} />,
      <Route key="/accounting/journal-entries" path="/accounting/journal-entries" element={g("/accounting", <S><JournalEntriesPage /></S>)} />,
      <Route key="/accounting/journal-entries/new" path="/accounting/journal-entries/new" element={g("/accounting", <S><JournalEntryFormPage /></S>)} />,
      <Route key="/accounting/journal-entries/:name" path="/accounting/journal-entries/:name" element={g("/accounting", <S><JournalEntryFormPage /></S>)} />,
      <Route key="/accounting/payment-entries" path="/accounting/payment-entries" element={g("/accounting", <S><PaymentEntriesPage /></S>)} />,
      <Route key="/accounting/payment-entries/new" path="/accounting/payment-entries/new" element={g("/accounting", <S><PaymentEntryFormPage /></S>)} />,
      <Route key="/accounting/payment-entries/:name" path="/accounting/payment-entries/:name" element={g("/accounting", <S><PaymentEntryFormPage /></S>)} />,
      <Route key="/accounting/reports/general-ledger" path="/accounting/reports/general-ledger" element={g("/accounting", <S><ReportGeneralLedgerPage /></S>)} />,
      <Route key="/accounting/reports/trial-balance" path="/accounting/reports/trial-balance" element={g("/accounting", <S><ReportTrialBalancePage /></S>)} />,
      <Route key="/accounting/reports/profit-and-loss" path="/accounting/reports/profit-and-loss" element={g("/accounting", <S><ReportProfitAndLossPage /></S>)} />,
      <Route key="/accounting/reports/balance-sheet" path="/accounting/reports/balance-sheet" element={g("/accounting", <S><ReportBalanceSheetPage /></S>)} />,
      <Route key="/accounting/reports/cash-flow" path="/accounting/reports/cash-flow" element={g("/accounting", <S><ReportCashFlowPage /></S>)} />,
      <Route key="/accounting/setup/settings" path="/accounting/setup/settings" element={g("/accounting", <S><AccountsSettingsPage /></S>)} />,
      <Route key="/accounting/setup/dimensions" path="/accounting/setup/dimensions" element={g("/accounting", <S><AccountingDimensionsPage /></S>)} />,
      <Route key="/import/supplier-quotations" path="/import/supplier-quotations" element={g("/purchase", <S><SupplierQuotationsPage /></S>)} />,
      <Route key="/import/supplier-quotations/new" path="/import/supplier-quotations/new" element={g("/purchase", <S><SupplierQuotationPage /></S>)} />,
      <Route key="/import/supplier-quotations/:name" path="/import/supplier-quotations/:name" element={g("/purchase", <S><SupplierQuotationPage /></S>)} />,
      <Route key="/import/supplier-quotations/:name/edit" path="/import/supplier-quotations/:name/edit" element={g("/purchase", <S><SupplierQuotationPage /></S>)} />,
      <Route key="/accounting/tax-templates/sales" path="/accounting/tax-templates/sales" element={g("/accounting", <S><TaxTemplatesPage doctype="Sales Taxes and Charges Template" title="Sales Tax Templates" subtitle="Taxes and charges applied on sugar and by-product sales" /></S>)} />,
      <Route key="/accounting/tax-templates/purchase" path="/accounting/tax-templates/purchase" element={g("/accounting", <S><TaxTemplatesPage doctype="Purchase Taxes and Charges Template" title="Purchase Tax Templates" subtitle="Taxes and charges applied on purchase invoices" /></S>)} />,
      <Route key="/accounting/tax-templates/sales" path="/accounting/tax-templates/sales" element={g("/accounting", <S><TaxTemplatesPage doctype="Sales Taxes and Charges Template" title="Sales Tax Templates" subtitle="Taxes and charges applied on sugar and by-product sales" /></S>)} />,
      <Route key="/accounting/tax-templates/purchase" path="/accounting/tax-templates/purchase" element={g("/accounting", <S><TaxTemplatesPage doctype="Purchase Taxes and Charges Template" title="Purchase Tax Templates" subtitle="Taxes and charges applied on purchase invoices" /></S>)} />,
  ];
}
