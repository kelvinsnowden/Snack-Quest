'use client';

import { createContext, useContext } from 'react';
import { kioskText, type KioskText } from '@/lib/kiosk/kioskText';

/** The machine screen's words in the customer's chosen language. Outside a screen (Admin previews of a card), English. */
const KioskTextContext = createContext<KioskText>(kioskText('en'));

export const KioskTextProvider = KioskTextContext.Provider;

export function useKioskText(): KioskText {
  return useContext(KioskTextContext);
}
