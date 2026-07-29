import React, { useEffect, useState } from 'react';
import { resolvePortal, PortalInfo } from '../../lib/domainResolver';
import { PortalSwitcherBar } from './PortalSwitcherBar';
import { PublicWebsitePortal } from './PublicWebsitePortal';
import { CustomerQuestPortal } from './CustomerQuestPortal';
import { CreatorPortal } from './CreatorPortal';
import { AdminOSPortal } from './AdminOSPortal';
import { ApiGatewayPortal } from './ApiGatewayPortal';

export const PortalBootstrap: React.FC = () => {
  const [portalInfo, setPortalInfo] = useState<PortalInfo>(resolvePortal());

  useEffect(() => {
    // Re-evaluate portal if query parameters change
    const handleUrlChange = () => {
      setPortalInfo(resolvePortal());
    };

    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  const renderActivePortal = () => {
    switch (portalInfo.type) {
      case 'public':
        return <PublicWebsitePortal />;
      case 'quest':
        return <CustomerQuestPortal />;
      case 'creators':
        return <CreatorPortal />;
      case 'admin':
        return <AdminOSPortal />;
      case 'api':
        return <ApiGatewayPortal />;
      default:
        return <PublicWebsitePortal />;
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-sans antialiased">
      <PortalSwitcherBar />
      {renderActivePortal()}
    </div>
  );
};
