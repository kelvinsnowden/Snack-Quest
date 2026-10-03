import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kioskScreenService, KioskScreenValidationError } from '@/services/kioskScreenService';
import { kioskScreenImageRepository, KioskScreenImageNotFoundError } from '@/repositories/kioskScreenImageRepository';
import { machineService } from '@/services/machineService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { adminFirestore } from '@/lib/firebase/admin';

/**
 * Artwork staff choose for the customer machine screen. What matters:
 * a machine shows its own images for a placement when it has any and
 * the fleet's otherwise (per placement, not all-or-nothing), switched-
 * off images never show, the rotation order is exactly what staff set,
 * nothing unsafe is ever stored as an image address, and one tenant can
 * never see or change another's.
 */

const BUSINESS_ID = 'biz-kiosk-screen';
const OTHER_BUSINESS_ID = 'biz-kiosk-screen-other';

async function clean() {
  for (const businessId of [BUSINESS_ID, OTHER_BUSINESS_ID]) {
    for (const collection of ['machines', 'deviceCredentials', 'kioskScreenImages']) {
      const snapshot = await adminFirestore.collection(collection).where('businessId', '==', businessId).get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }
  }
}

beforeEach(clean);
afterEach(clean);

async function provisionMachine(machineCode: string, businessId = BUSINESS_ID) {
  const { machineId } = await machineService.provisionDevice({ businessId, machineCode, serialNumber: `SN-${machineCode}`, manufacturer: 'mock', model: 'test', actor: 'staff-1' });
  return machineId;
}

const add = (input: { placement?: 'menu_banner' | 'attract'; machineId?: string | null; imageUrl?: string; altText?: string; businessId?: string }) =>
  kioskScreenService.addImage({
    businessId: input.businessId ?? BUSINESS_ID,
    placement: input.placement ?? 'menu_banner',
    machineId: input.machineId ?? null,
    imageUrl: input.imageUrl ?? 'https://blob.example/banner.webp',
    altText: input.altText ?? 'New this week',
    actor: 'staff-1',
  });

describe('kioskScreenService — what a machine shows', () => {
  it('shows the fleet images until a machine has its own, per placement', async () => {
    const machineA = await provisionMachine('SQ-SCREEN-A');
    const machineB = await provisionMachine('SQ-SCREEN-B');
    await add({ imageUrl: 'https://blob.example/fleet-banner.webp', altText: 'Fleet banner' });
    await add({ placement: 'attract', imageUrl: 'https://blob.example/fleet-idle.webp', altText: 'Fleet idle' });
    await add({ machineId: machineA, imageUrl: 'https://blob.example/campus-banner.webp', altText: 'Campus banner' });

    const a = await kioskScreenService.resolveForMachine(BUSINESS_ID, machineA);
    const b = await kioskScreenService.resolveForMachine(BUSINESS_ID, machineB);

    // A's own banner replaces the fleet banner; with no idle image of its own it still gets the fleet's.
    expect(a.menu_banner).toEqual([{ imageUrl: 'https://blob.example/campus-banner.webp', altText: 'Campus banner' }]);
    expect(a.attract).toEqual([{ imageUrl: 'https://blob.example/fleet-idle.webp', altText: 'Fleet idle' }]);
    expect(b.menu_banner).toEqual([{ imageUrl: 'https://blob.example/fleet-banner.webp', altText: 'Fleet banner' }]);
  });

  it('never shows a switched-off image, and falls back to the fleet when every own image is off', async () => {
    const machineId = await provisionMachine('SQ-SCREEN-OFF');
    await add({ imageUrl: 'https://blob.example/fleet.webp', altText: 'Fleet' });
    const own = await add({ machineId, imageUrl: 'https://blob.example/own.webp', altText: 'Own' });
    await kioskScreenService.updateImage(BUSINESS_ID, own, { active: false }, 'staff-1');

    const content = await kioskScreenService.resolveForMachine(BUSINESS_ID, machineId);
    expect(content.menu_banner.map((image) => image.altText)).toEqual(['Fleet']);
  });

  it('is empty when nothing is chosen, so the screen draws its built-in design', async () => {
    const machineId = await provisionMachine('SQ-SCREEN-NONE');
    expect(await kioskScreenService.resolveForMachine(BUSINESS_ID, machineId)).toEqual({ menu_banner: [], attract: [] });
  });

  it('rotates in the order staff set, and a move swaps exactly two neighbours', async () => {
    const first = await add({ altText: 'First' });
    await add({ altText: 'Second' });
    const third = await add({ altText: 'Third' });
    const machineId = await provisionMachine('SQ-SCREEN-ORDER');
    const order = async () => (await kioskScreenService.resolveForMachine(BUSINESS_ID, machineId)).menu_banner.map((image) => image.altText);

    expect(await order()).toEqual(['First', 'Second', 'Third']);
    await kioskScreenService.moveImage(BUSINESS_ID, third, 'earlier', 'staff-1');
    expect(await order()).toEqual(['First', 'Third', 'Second']);
    // Already first: nothing moves.
    await kioskScreenService.moveImage(BUSINESS_ID, first, 'earlier', 'staff-1');
    expect(await order()).toEqual(['First', 'Third', 'Second']);
    // Deleting leaves a gap; moves still work on the renumbered group.
    await kioskScreenService.deleteImage(BUSINESS_ID, first);
    await kioskScreenService.moveImage(BUSINESS_ID, third, 'later', 'staff-1');
    expect(await order()).toEqual(['Second', 'Third']);
  });
});

describe('kioskScreenService — validation', () => {
  it('stores only https or site-relative image addresses', async () => {
    for (const imageUrl of ['javascript:alert(1)', 'http://blob.example/a.webp', 'data:image/png;base64,AAAA', '//evil.example/a.webp', 'not a url']) {
      await expect(add({ imageUrl })).rejects.toBeInstanceOf(KioskScreenValidationError);
    }
    await expect(add({ imageUrl: '/logo.png' })).resolves.toEqual(expect.any(String));
  });

  it('requires a description of the image, and keeps it short', async () => {
    await expect(add({ altText: '   ' })).rejects.toBeInstanceOf(KioskScreenValidationError);
    await expect(add({ altText: 'x'.repeat(161) })).rejects.toBeInstanceOf(KioskScreenValidationError);
    const id = await add({ altText: '  Honey butter chips  ' });
    expect((await kioskScreenImageRepository.findById(BUSINESS_ID, id))?.altText).toBe('Honey butter chips');
  });

  it('refuses a machine that is not this business’s, and more images than a placement holds', async () => {
    const foreign = await provisionMachine('SQ-SCREEN-FOREIGN', OTHER_BUSINESS_ID);
    await expect(add({ machineId: foreign })).rejects.toBeInstanceOf(MachineNotFoundError);
    for (let i = 0; i < 8; i += 1) await add({ altText: `Banner ${i}` });
    await expect(add({ altText: 'One too many' })).rejects.toThrow(/already has 8 images/);
    // The cap is per placement and scope: the idle screen still has room.
    await expect(add({ placement: 'attract' })).resolves.toEqual(expect.any(String));
  });
});

describe('kioskScreenService — tenant isolation', () => {
  it('never lists, changes or deletes another business’s images', async () => {
    const theirs = await add({ businessId: OTHER_BUSINESS_ID, altText: 'Theirs' });
    expect(await kioskScreenService.list(BUSINESS_ID)).toEqual([]);
    expect(await kioskScreenImageRepository.findById(BUSINESS_ID, theirs)).toBeNull();
    await expect(kioskScreenService.updateImage(BUSINESS_ID, theirs, { active: false }, 'staff-1')).rejects.toBeInstanceOf(KioskScreenImageNotFoundError);
    await expect(kioskScreenService.deleteImage(BUSINESS_ID, theirs)).rejects.toBeInstanceOf(KioskScreenImageNotFoundError);
    await expect(kioskScreenService.moveImage(BUSINESS_ID, theirs, 'later', 'staff-1')).rejects.toBeInstanceOf(KioskScreenValidationError);
    expect((await kioskScreenImageRepository.findById(OTHER_BUSINESS_ID, theirs))?.active).toBe(true);

    // And a machine of ours never shows their fleet images.
    const ours = await provisionMachine('SQ-SCREEN-OURS');
    expect((await kioskScreenService.resolveForMachine(BUSINESS_ID, ours)).menu_banner).toEqual([]);
  });
});
