import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import viCommon from './locales/vi/common.json';
import viNav from './locales/vi/nav.json';
import viDashboard from './locales/vi/dashboard.json';
import viAuth from './locales/vi/auth.json';
import viEmployee from './locales/vi/employee.json';
import viDepartment from './locales/vi/department.json';
import viPosition from './locales/vi/position.json';
import viPermission from './locales/vi/permission.json';
import viRole from './locales/vi/role.json';
import viLeave from './locales/vi/leave.json';
import viPayment from './locales/vi/payment.json';
import viTimesheet from './locales/vi/timesheet.json';
import viPayroll from './locales/vi/payroll.json';
import viEmployeeImport from './locales/vi/employeeImport.json';
import viContracts from './locales/vi/contracts.json';
import viNotifications from './locales/vi/notifications.json';
import viAsset from './locales/vi/asset.json';
import viAssetImport from './locales/vi/assetImport.json';
import viRecruitment from './locales/vi/recruitment.json';
import viProbation from './locales/vi/probation.json';
import viSettings from './locales/vi/settings.json';
import viAccount from './locales/vi/account.json';

import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enDashboard from './locales/en/dashboard.json';
import enAuth from './locales/en/auth.json';
import enEmployee from './locales/en/employee.json';
import enDepartment from './locales/en/department.json';
import enPosition from './locales/en/position.json';
import enPermission from './locales/en/permission.json';
import enRole from './locales/en/role.json';
import enLeave from './locales/en/leave.json';
import enPayment from './locales/en/payment.json';
import enTimesheet from './locales/en/timesheet.json';
import enPayroll from './locales/en/payroll.json';
import enEmployeeImport from './locales/en/employeeImport.json';
import enContracts from './locales/en/contracts.json';
import enNotifications from './locales/en/notifications.json';
import enAsset from './locales/en/asset.json';
import enAssetImport from './locales/en/assetImport.json';
import enRecruitment from './locales/en/recruitment.json';
import enProbation from './locales/en/probation.json';
import enSettings from './locales/en/settings.json';
import enAccount from './locales/en/account.json';

export const defaultNS = 'common';

export const resources = {
  vi: {
    common: viCommon,
    nav: viNav,
    dashboard: viDashboard,
    auth: viAuth,
    employee: viEmployee,
    department: viDepartment,
    position: viPosition,
    permission: viPermission,
    role: viRole,
    leave: viLeave,
    payment: viPayment,
    timesheet: viTimesheet,
    payroll: viPayroll,
    employeeImport: viEmployeeImport,
    contracts: viContracts,
    notifications: viNotifications,
    asset: viAsset,
    assetImport: viAssetImport,
    recruitment: viRecruitment,
    probation: viProbation,
    settings: viSettings,
    account: viAccount,
  },
  en: {
    common: enCommon,
    nav: enNav,
    dashboard: enDashboard,
    auth: enAuth,
    employee: enEmployee,
    department: enDepartment,
    position: enPosition,
    permission: enPermission,
    role: enRole,
    leave: enLeave,
    payment: enPayment,
    timesheet: enTimesheet,
    payroll: enPayroll,
    employeeImport: enEmployeeImport,
    contracts: enContracts,
    notifications: enNotifications,
    asset: enAsset,
    assetImport: enAssetImport,
    recruitment: enRecruitment,
    probation: enProbation,
    settings: enSettings,
    account: enAccount,
  },
} as const;

function getInitialLanguage(): 'vi' | 'en' {
  try {
    const raw = localStorage.getItem('hrm-theme');
    if (raw) {
      const lng = JSON.parse(raw)?.state?.language;
      if (lng === 'vi' || lng === 'en') return lng;
    }
  } catch {
    // ignore malformed storage
  }
  return 'vi';
}

const initialLanguage = getInitialLanguage();

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'vi',
  defaultNS,
  ns: ['common', 'nav', 'dashboard', 'auth', 'employee', 'department', 'position', 'permission', 'role', 'leave', 'payment', 'timesheet', 'payroll', 'employeeImport', 'contracts', 'notifications', 'asset', 'assetImport', 'recruitment', 'probation'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

document.documentElement.lang = initialLanguage;

export default i18n;
