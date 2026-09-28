import type { Timestamp } from 'firebase/firestore';

/**
 * `kioskScreenImages/{imageId}` — artwork staff choose for a named part
 * of the customer machine screen (`components/kiosk/KioskScreen.tsx`).
 *
 * Each image belongs to one placement, and to either the whole fleet
 * (`machineId: null`) or one machine. A machine shows its own images
 * for a placement when it has any active ones; otherwise it shows the
 * fleet-wide set — so a single machine can run a local campaign without
 * copying every other banner onto it. See
 * `kioskScreenService.resolveForMachine`.
 *
 * Product photos are not here: those belong to the product (the snack
 * catalogue) or to one machine's assortment row, because they describe
 * a product, not a part of the screen.
 */
export type KioskScreenPlacement = 'menu_banner' | 'attract';

export interface KioskScreenPlacementSpec {
  label: string;
  /** Where it appears, in words a person arranging artwork recognises. */
  description: string;
  /** Pixel size the artwork is designed for — the screen crops anything else to fill. */
  recommendedWidth: number;
  recommendedHeight: number;
  /** Most images one scope can rotate through in this placement. */
  maxImages: number;
}

export const KIOSK_SCREEN_PLACEMENTS: Record<KioskScreenPlacement, KioskScreenPlacementSpec> = {
  menu_banner: {
    label: 'Menu banner',
    description: 'The wide banner at the top of the menu, above the categories. Several images rotate every few seconds.',
    recommendedWidth: 1080,
    recommendedHeight: 400,
    maxImages: 8,
  },
  attract: {
    label: 'Idle screen',
    description: 'Fills the whole screen while nobody is using the machine. A tap anywhere opens the menu.',
    recommendedWidth: 1080,
    recommendedHeight: 1920,
    maxImages: 8,
  },
};

export const KIOSK_SCREEN_PLACEMENT_KEYS = Object.keys(KIOSK_SCREEN_PLACEMENTS) as KioskScreenPlacement[];

export function isKioskScreenPlacement(value: unknown): value is KioskScreenPlacement {
  return typeof value === 'string' && (KIOSK_SCREEN_PLACEMENT_KEYS as string[]).includes(value);
}

export interface KioskScreenImage {
  businessId: string;
  placement: KioskScreenPlacement;
  /** Null = every machine that has no active images of its own for this placement. */
  machineId: string | null;
  imageUrl: string;
  /** Read aloud by screen readers and shown if the image fails to load — describe what the artwork says. */
  altText: string;
  /** Rotation order within its placement and scope, lowest first. */
  displayOrder: number;
  /** Inactive images stay in the library for later without appearing on any screen. */
  active: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** What the machine screen receives — only what it needs to draw. */
export interface KioskScreenContentImage {
  imageUrl: string;
  altText: string;
}

export type KioskScreenContent = Record<KioskScreenPlacement, KioskScreenContentImage[]>;
