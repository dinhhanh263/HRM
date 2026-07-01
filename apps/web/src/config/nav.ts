import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarOff,
  ClipboardList,
  ClipboardCheck,
  Banknote,
  Building2,
  Briefcase,
  CalendarClock,
  Settings,
  CalendarCog,
  ShieldCheck,
  Boxes,
  Package,
  UserCheck,
  UserSearch,
  Receipt,
  ShoppingCart,
  Target,
  UsersRound,
  Gauge,
  Activity,
  MessageSquare,
  Contact,
  Columns3,
  Wallet,
  Tags,
  ArrowRightLeft,
  PieChart,
  Coins,
  FileBarChart,
} from 'lucide-react';
import type { PermissionKey } from '@hrm/shared';

export interface NavItem {
  icon: React.ElementType;
  labelKey: string;
  href: string;
  permission: PermissionKey;
  // SPEC-033: chỉ hiện khi user hiện tại đang có hợp đồng thử việc.
  requiresProbationContract?: boolean;
}

export interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

// Nguồn tập trung của toàn bộ navigation. Sidebar render từ đây; LoginPage đếm
// số "core modules" từ navGroups.length để con số luôn khớp số nhóm chức năng thật.
export const navGroups: NavGroup[] = [
  {
    titleKey: 'groups.overview',
    items: [
      { icon: LayoutDashboard, labelKey: 'items.dashboard', href: '/', permission: 'dashboard:view' },
    ],
  },
  {
    titleKey: 'groups.hr',
    items: [
      { icon: Users, labelKey: 'items.employees', href: '/employees', permission: 'employees:view' },
      { icon: Building2, labelKey: 'items.departments', href: '/departments', permission: 'departments:view' },
      { icon: Briefcase, labelKey: 'items.positions', href: '/positions', permission: 'positions:view' },
      { icon: UserSearch, labelKey: 'items.recruitment', href: '/recruitment', permission: 'recruitment:job_view' },
      { icon: Users, labelKey: 'items.candidates', href: '/recruitment/candidates', permission: 'recruitment:candidate_view' },
      { icon: CalendarClock, labelKey: 'items.myInterviews', href: '/recruitment/my-interviews', permission: 'recruitment:scorecard_submit' },
    ],
  },
  {
    titleKey: 'groups.operations',
    items: [
      { icon: Clock, labelKey: 'items.timesheet', href: '/timesheet', permission: 'timesheet:view' },
      { icon: CalendarOff, labelKey: 'items.leave', href: '/leave', permission: 'leave:view' },
      { icon: ClipboardList, labelKey: 'items.leaveBalances', href: '/leave/balances', permission: 'leave:approve' },
      { icon: ClipboardCheck, labelKey: 'items.probation', href: '/probation', permission: 'probation:view' },
      { icon: UserCheck, labelKey: 'items.probationSelf', href: '/probation/me', permission: 'probation:self', requiresProbationContract: true },
      { icon: Banknote, labelKey: 'items.payroll', href: '/payroll', permission: 'payroll:view' },
      { icon: Gauge, labelKey: 'items.kpi', href: '/kpi', permission: 'kpi:enter' },
      { icon: Activity, labelKey: 'items.myKpi', href: '/kpi/me', permission: 'kpi:view' },
      { icon: Package, labelKey: 'items.assets', href: '/assets', permission: 'assets:view' },
    ],
  },
  {
    titleKey: 'groups.finance',
    items: [
      { icon: PieChart, labelKey: 'items.financeDashboard', href: '/finance', permission: 'finance:view' },
      { icon: Receipt, labelKey: 'items.paymentRequests', href: '/payment-requests', permission: 'payment_request:view' },
      { icon: ShoppingCart, labelKey: 'items.purchaseRequests', href: '/purchase-requests', permission: 'purchase_request:view' },
      { icon: Wallet, labelKey: 'items.fundAccounts', href: '/finance/accounts', permission: 'fund_account:view' },
      { icon: ArrowRightLeft, labelKey: 'items.cashTransactions', href: '/finance/transactions', permission: 'cash_transaction:view' },
      { icon: ClipboardList, labelKey: 'items.spendingPlans', href: '/finance/spending-plans', permission: 'spending_plan:view' },
      { icon: Coins, labelKey: 'items.topUpRequests', href: '/finance/topup-requests', permission: 'topup_request:view' },
      { icon: FileBarChart, labelKey: 'items.financeReport', href: '/finance/reports', permission: 'finance:view' },
      { icon: Tags, labelKey: 'items.financeCategories', href: '/finance/categories', permission: 'cash_transaction:view' },
    ],
  },
  {
    titleKey: 'groups.sales',
    items: [
      { icon: Gauge, labelKey: 'items.salesDashboard', href: '/sales', permission: 'sales:report_view' },
      { icon: Contact, labelKey: 'items.salesCustomers', href: '/sales/customers', permission: 'sales:customer_view' },
      { icon: Columns3, labelKey: 'items.salesPipeline', href: '/sales/pipeline', permission: 'sales:deal_view' },
      { icon: ClipboardList, labelKey: 'items.salesTasks', href: '/sales/tasks', permission: 'sales:task_view' },
      { icon: Building2, labelKey: 'items.salesCompanies', href: '/sales/companies', permission: 'sales:customer_view' },
      { icon: Package, labelKey: 'items.salesProducts', href: '/sales/products', permission: 'sales:product_view' },
    ],
  },
  {
    titleKey: 'groups.system',
    items: [
      { icon: ShieldCheck, labelKey: 'items.roles', href: '/settings/roles', permission: 'roles:view' },
      { icon: Target, labelKey: 'items.kpiFrameworks', href: '/settings/kpi', permission: 'kpi:config' },
      { icon: UsersRound, labelKey: 'items.teams', href: '/settings/kpi/teams', permission: 'kpi:config' },
      { icon: MessageSquare, labelKey: 'items.kpiSurveys', href: '/settings/kpi/surveys', permission: 'kpi:survey_manage' },
      { icon: Columns3, labelKey: 'items.salesSettings', href: '/settings/sales', permission: 'sales:settings' },
      { icon: CalendarCog, labelKey: 'items.timesheetSettings', href: '/settings/timesheet', permission: 'timesheet:view' },
      { icon: Boxes, labelKey: 'items.assetSettings', href: '/settings/assets', permission: 'assets:view' },
      { icon: Settings, labelKey: 'items.settings', href: '/settings', permission: 'settings:view' },
    ],
  },
];

// Số nhóm chức năng (core modules) — dùng cho marketing stat ở LoginPage.
export const CORE_MODULE_COUNT = navGroups.length;
