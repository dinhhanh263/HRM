import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { SetPasswordPage } from '@/features/auth/pages/SetPasswordPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { GoogleCallbackPage } from '@/features/auth/pages/GoogleCallbackPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CalendarPage } from '@/features/calendar';
import { SettingsPage } from '@/features/settings';
import { AccountPage } from '@/features/account';
import {
  EmployeeListPage,
  EmployeeDetailPage,
  CreateEmployeePage,
  EditEmployeePage,
} from '@/features/employees';
import { DepartmentListPage } from '@/features/departments';
import { PositionListPage } from '@/features/positions';
import { RolesPage } from '@/features/roles';
import { LeavePage, LeaveBalanceRosterPage } from '@/features/leave';
import { PaymentRequestPage } from '@/features/payment-request';
import { PurchaseRequestPage, CreatePurchaseRequestPage } from '@/features/purchase-request';
import { TimesheetPage, TimesheetSettingsPage } from '@/features/timesheet';
import { PayrollPage } from '@/features/payroll';
import { ProbationPage, ProbationSelfPage } from '@/features/probation';
import { AssetSettingsPage, AssetsPage, AssetDetailPage } from '@/features/assets';
import {
  JobListPage,
  JobDetailPage,
  ApplicationDetailPage,
  PipelineTemplatesPage,
  CandidateListPage,
  CandidateDetailPage,
  MyInterviewsPage,
} from '@/features/recruitment';
import { KpiConfigPage, KpiTeamsPage, KpiCyclesPage, KpiCycleDetailPage, MyKpiPage, EmployeeKpiPage, KpiSurveysPage } from '@/features/kpi';
import { CustomerListPage, CustomerDetailPage, CompanyListPage, PipelinePage, SalesSettingsPage, ProductListPage, MyTasksPage, SalesDashboardPage } from '@/features/sales';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RequirePermission } from '@/components/auth/RequirePermission';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/set-password',
    element: <SetPasswordPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/auth/google/success',
    element: <GoogleCallbackPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        // SPEC-035: lịch sự kiện nhân sự theo tháng (link "Xem lịch" trên Dashboard).
        path: 'calendar',
        element: (
          <RequirePermission permission="dashboard:view">
            <CalendarPage />
          </RequirePermission>
        ),
      },
      {
        path: 'employees',
        element: (
          <RequirePermission permission="employees:view">
            <EmployeeListPage />
          </RequirePermission>
        ),
      },
      {
        path: 'employees/new',
        element: (
          <RequirePermission permission="employees:create">
            <CreateEmployeePage />
          </RequirePermission>
        ),
      },
      {
        path: 'employees/:id',
        element: (
          <RequirePermission permission="employees:view">
            <EmployeeDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'employees/:id/edit',
        element: (
          <RequirePermission permission="employees:update">
            <EditEmployeePage />
          </RequirePermission>
        ),
      },
      {
        path: 'departments',
        element: (
          <RequirePermission permission="departments:view">
            <DepartmentListPage />
          </RequirePermission>
        ),
      },
      {
        path: 'positions',
        element: (
          <RequirePermission permission="positions:view">
            <PositionListPage />
          </RequirePermission>
        ),
      },
      {
        // SPEC-037: tài khoản của tôi — self-service, mọi role đều vào được.
        path: 'account',
        element: <AccountPage />,
      },
      {
        // SPEC-036: trung tâm cài đặt tenant (hub + company/notifications/regional/security).
        path: 'settings',
        element: (
          <RequirePermission permission="settings:view">
            <SettingsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'settings/roles',
        element: (
          <RequirePermission permission="roles:view">
            <RolesPage />
          </RequirePermission>
        ),
      },
      {
        // SPEC-045: Sales / CRM — Khách hàng (Task 1.1)
        path: 'sales/customers',
        element: (
          <RequirePermission permission="sales:customer_view">
            <CustomerListPage />
          </RequirePermission>
        ),
      },
      {
        path: 'sales/customers/:id',
        element: (
          <RequirePermission permission="sales:customer_view">
            <CustomerDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'sales/companies',
        element: (
          <RequirePermission permission="sales:customer_view">
            <CompanyListPage />
          </RequirePermission>
        ),
      },
      {
        path: 'sales/pipeline',
        element: (
          <RequirePermission permission="sales:deal_view">
            <PipelinePage />
          </RequirePermission>
        ),
      },
      {
        path: 'sales',
        element: (
          <RequirePermission permission="sales:report_view">
            <SalesDashboardPage />
          </RequirePermission>
        ),
      },
      {
        path: 'sales/tasks',
        element: (
          <RequirePermission permission="sales:task_view">
            <MyTasksPage />
          </RequirePermission>
        ),
      },
      {
        path: 'sales/products',
        element: (
          <RequirePermission permission="sales:product_view">
            <ProductListPage />
          </RequirePermission>
        ),
      },
      {
        path: 'settings/sales',
        element: (
          <RequirePermission permission="sales:settings">
            <SalesSettingsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'kpi',
        element: (
          <RequirePermission permission="kpi:enter">
            <KpiCyclesPage />
          </RequirePermission>
        ),
      },
      {
        path: 'kpi/me',
        element: (
          <RequirePermission permission="kpi:view">
            <MyKpiPage />
          </RequirePermission>
        ),
      },
      {
        path: 'kpi/employee/:employeeId',
        element: (
          <RequirePermission anyOf={['kpi:view', 'kpi:view_team', 'kpi:view_all']}>
            <EmployeeKpiPage />
          </RequirePermission>
        ),
      },
      {
        path: 'kpi/:id',
        element: (
          <RequirePermission permission="kpi:enter">
            <KpiCycleDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'settings/kpi',
        element: (
          <RequirePermission permission="kpi:config">
            <KpiConfigPage />
          </RequirePermission>
        ),
      },
      {
        path: 'settings/kpi/teams',
        element: (
          <RequirePermission permission="kpi:config">
            <KpiTeamsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'settings/kpi/surveys',
        element: (
          <RequirePermission permission="kpi:survey_manage">
            <KpiSurveysPage />
          </RequirePermission>
        ),
      },
      {
        path: 'timesheet',
        element: (
          <RequirePermission permission="timesheet:view">
            <TimesheetPage />
          </RequirePermission>
        ),
      },
      {
        path: 'settings/timesheet',
        element: (
          <RequirePermission permission="timesheet:view">
            <TimesheetSettingsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'leave',
        element: (
          <RequirePermission permission="leave:view">
            <LeavePage />
          </RequirePermission>
        ),
      },
      {
        path: 'leave/balances',
        element: (
          <RequirePermission anyOf={['leave:approve', 'leave:reject']}>
            <LeaveBalanceRosterPage />
          </RequirePermission>
        ),
      },
      {
        path: 'payment-requests',
        element: (
          <RequirePermission permission="payment_request:view">
            <PaymentRequestPage />
          </RequirePermission>
        ),
      },
      {
        path: 'purchase-requests',
        element: (
          <RequirePermission permission="purchase_request:view">
            <PurchaseRequestPage />
          </RequirePermission>
        ),
      },
      {
        path: 'purchase-requests/new',
        element: (
          <RequirePermission permission="purchase_request:create">
            <CreatePurchaseRequestPage />
          </RequirePermission>
        ),
      },
      {
        path: 'purchase-requests/:id/resubmit',
        element: (
          <RequirePermission permission="purchase_request:create">
            <CreatePurchaseRequestPage />
          </RequirePermission>
        ),
      },
      {
        path: 'payroll',
        element: (
          <RequirePermission permission="payroll:view">
            <PayrollPage />
          </RequirePermission>
        ),
      },
      {
        path: 'probation',
        element: (
          <RequirePermission permission="probation:view">
            <ProbationPage />
          </RequirePermission>
        ),
      },
      {
        // SPEC-033: trang tự đánh giá của nhân viên thử việc (Step 1).
        path: 'probation/me',
        element: (
          <RequirePermission permission="probation:self">
            <ProbationSelfPage />
          </RequirePermission>
        ),
      },
      {
        path: 'assets',
        element: (
          <RequirePermission permission="assets:view">
            <AssetsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'assets/:id',
        element: (
          <RequirePermission permission="assets:view">
            <AssetDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'settings/assets',
        element: (
          <RequirePermission permission="assets:view">
            <AssetSettingsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'recruitment',
        element: (
          <RequirePermission permission="recruitment:job_view">
            <JobListPage />
          </RequirePermission>
        ),
      },
      {
        path: 'recruitment/pipelines',
        element: (
          <RequirePermission permission="recruitment:job_update">
            <PipelineTemplatesPage />
          </RequirePermission>
        ),
      },
      {
        path: 'recruitment/jobs/:id',
        element: (
          <RequirePermission permission="recruitment:job_view">
            <JobDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'recruitment/applications/:id',
        element: (
          <RequirePermission permission="recruitment:application_view">
            <ApplicationDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'recruitment/my-interviews',
        element: (
          <RequirePermission permission="recruitment:scorecard_submit">
            <MyInterviewsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'recruitment/candidates',
        element: (
          <RequirePermission permission="recruitment:candidate_view">
            <CandidateListPage />
          </RequirePermission>
        ),
      },
      {
        path: 'recruitment/candidates/:id',
        element: (
          <RequirePermission permission="recruitment:candidate_view">
            <CandidateDetailPage />
          </RequirePermission>
        ),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
