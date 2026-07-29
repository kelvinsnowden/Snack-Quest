import React from 'react';
import { useApp } from '../../context/AppContext';
import { LoginForm } from '../auth/LoginForm';
import { AppLayout } from '../layout/AppLayout';
import { DashboardShell } from '../dashboard/DashboardShell';
import { CustomerList } from '../crm/CustomerList';
import { OrderList } from '../orders/OrderList';
import { InventoryManager } from '../inventory/InventoryManager';
import { DeliveryManager } from '../deliveries/DeliveryManager';
import { AccountingManager } from '../accounting/AccountingManager';
import { PaymentOperationsHub } from '../payments/PaymentOperationsHub';
import { RewardsManager } from '../rewards/RewardsManager';
import { WalletManager } from '../wallet/WalletManager';
import { ReferralManager } from '../referrals/ReferralManager';
import { MarketingDashboard } from '../marketing/MarketingDashboard';
import { RolesPermissionsMatrix } from '../roles/RolesPermissionsMatrix';
import { StaffUsersTable } from '../staff/StaffUsersTable';
import { IntegrationCenter } from '../integrations/IntegrationCenter';
import { SystemHealthCenter } from '../monitoring/SystemHealthCenter';
import { ReportingCenter } from '../reports/ReportingCenter';
import { BusinessSettingsManager } from '../settings/BusinessSettingsManager';
import { DomainManager } from '../settings/DomainManager';
import { AuditLogViewer } from '../audit/AuditLogViewer';
import { ShieldAlert } from 'lucide-react';

export const AdminOSPortal: React.FC = () => {
  const { isAuthenticated, activeTab, currentRole, checkPermission } = useApp();

  // Enforce staff authentication: if unauthenticated, show staff login screen
  if (!isAuthenticated) {
    return <LoginForm />;
  }

  // RBAC Route Isolation Check
  const isAllowed = () => {
    if (!currentRole) return true;
    if (currentRole.name === 'Administrator') return true;

    switch (activeTab) {
      case 'dashboard':
        return true;
      case 'orders':
      case 'deliveries':
      case 'inventory':
        return ['Administrator', 'Operations Manager', 'Staff'].includes(currentRole.name);
      case 'accounting':
      case 'payments':
      case 'wallet':
        return ['Administrator', 'Finance Officer'].includes(currentRole.name);
      case 'marketing':
      case 'referrals':
      case 'rewards':
        return ['Administrator', 'Marketing Lead'].includes(currentRole.name);
      case 'crm':
        return true;
      case 'roles':
      case 'staff':
      case 'domain_manager':
      case 'business_settings':
      case 'audit':
        return currentRole.name === 'Administrator';
      default:
        return true;
    }
  };

  const renderScreen = () => {
    if (!isAllowed()) {
      return (
        <div className="p-8 max-w-lg mx-auto text-center space-y-4 font-sans text-white my-12">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold">403 Access Forbidden</h2>
          <p className="text-xs text-zinc-400">
            Your role (<strong className="text-white">{currentRole?.name}</strong>) does not have permission to view module <strong className="text-amber-400 font-mono">{activeTab}</strong>.
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardShell />;
      case 'crm':
        return <CustomerList />;
      case 'orders':
        return <OrderList />;
      case 'inventory':
        return <InventoryManager />;
      case 'deliveries':
        return <DeliveryManager />;
      case 'accounting':
        return <AccountingManager />;
      case 'payments':
        return <PaymentOperationsHub />;
      case 'rewards':
        return <RewardsManager />;
      case 'wallet':
        return <WalletManager />;
      case 'referrals':
        return <ReferralManager />;
      case 'marketing':
        return <MarketingDashboard />;
      case 'roles':
        return <RolesPermissionsMatrix />;
      case 'staff':
        return <StaffUsersTable />;
      case 'integrations':
        return <IntegrationCenter />;
      case 'api_monitoring':
        return <SystemHealthCenter />;
      case 'reporting':
        return <ReportingCenter />;
      case 'domain_manager':
        return <DomainManager />;
      case 'business_settings':
        return <BusinessSettingsManager />;
      case 'audit':
        return <AuditLogViewer />;
      default:
        return <DashboardShell />;
    }
  };

  return <AppLayout>{renderScreen()}</AppLayout>;
};
