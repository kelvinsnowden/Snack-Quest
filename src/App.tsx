/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider } from './context/AppContext';
import { PortalBootstrap } from './components/portals/PortalBootstrap';

export default function App() {
  return (
    <AppProvider>
      <PortalBootstrap />
    </AppProvider>
  );
}

