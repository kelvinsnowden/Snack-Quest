import React, { useState } from 'react';
import { CreatorPortalAuth } from '../auth/CreatorPortalAuth';

export const CreatorPortal: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-sans antialiased">
      <CreatorPortalAuth />
    </div>
  );
};
