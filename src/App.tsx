/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardShell } from './components/dashboard/DashboardShell';
import { CustomerList } from './components/crm/CustomerList';
import { OrderList } from './components/orders/OrderList';
import { InventoryManager } from './components/inventory/InventoryManager';
import { DeliveryManager } from './components/deliveries/DeliveryManager';
import { AccountingManager } from './components/accounting/AccountingManager';
import { PaymentOperationsHub } from './components/payments/PaymentOperationsHub';
import { RewardsManager } from './components/rewards/RewardsManager';
import { WalletManager } from './components/wallet/WalletManager';
import { ReferralManager } from './components/referrals/ReferralManager';
import { MarketingDashboard } from './components/marketing/MarketingDashboard';
import { RolesPermissionsMatrix } from './components/roles/RolesPermissionsMatrix';
import { StaffUsersTable } from './components/staff/StaffUsersTable';
import { IntegrationCenter } from './components/integrations/IntegrationCenter';
import { SystemHealthCenter } from './components/monitoring/SystemHealthCenter';
import { ReportingCenter } from './components/reports/ReportingCenter';
import { BusinessSettingsManager } from './components/settings/BusinessSettingsManager';
import { DomainManager } from './components/settings/DomainManager';
import { AuditLogViewer } from './components/audit/AuditLogViewer';
import QuestCenterContainer from './components/quest-center/QuestCenterContainer';

const AppContent: React.FC = () => {
  const { activeTab } = useApp();

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'quest_center':
        return <QuestCenterContainer />;
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

  return <AppLayout>{renderActiveScreen()}</AppLayout>;
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
