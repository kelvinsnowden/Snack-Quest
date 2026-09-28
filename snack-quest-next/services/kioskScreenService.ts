import 'server-only';

import { kioskScreenImageRepository } from '@/repositories/kioskScreenImageRepository';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import {
  KIOSK_SCREEN_PLACEMENTS,
  KIOSK_SCREEN_PLACEMENT_KEYS,
  type KioskScreenContent,
  type KioskScreenImage,
  type KioskScreenPlacement,
} from '@/types';

export class KioskScreenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KioskScreenValidationError';
  }
}

const ALT_TEXT_MAX = 160;

/** An uploaded image (https) or a file shipped with the site (`/…`). Anything else — `javascript:`, `data:`, plain http — is refused. */
function isAcceptableImageUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) {
    return true;
  }
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function byOrder(a: { id: string; data: KioskScreenImage }, b: { id: string; data: KioskScreenImage }): number {
  return a.data.displayOrder - b.data.displayOrder || a.id.localeCompare(b.id);
}

/**
 * Staff-chosen artwork for named parts of the customer machine screen
 * (§ `KioskScreenImage`). Writes are staff-only (routes under
 * `/api/vending/kiosk-screen`); the one read a machine makes is
 * `resolveForMachine`, through its own device-authenticated route.
 */
class KioskScreenService {
  private async assertMachine(businessId: string, machineId: string | null): Promise<void> {
    if (machineId === null) {
      return;
    }
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
  }

  private cleanAltText(value: string): string {
    const altText = value.trim();
    if (!altText) {
      throw new KioskScreenValidationError('Describe the image in a few words — it is read aloud to customers who cannot see the screen.');
    }
    if (altText.length > ALT_TEXT_MAX) {
      throw new KioskScreenValidationError(`Keep the description under ${ALT_TEXT_MAX} characters.`);
    }
    return altText;
  }

  async list(businessId: string): Promise<{ id: string; data: KioskScreenImage }[]> {
    const rows = await kioskScreenImageRepository.listByBusiness(businessId);
    return rows.sort(byOrder);
  }

  async addImage(input: {
    businessId: string;
    placement: KioskScreenPlacement;
    machineId: string | null;
    imageUrl: string;
    altText: string;
    actor: string;
  }): Promise<string> {
    const imageUrl = input.imageUrl.trim();
    if (!isAcceptableImageUrl(imageUrl)) {
      throw new KioskScreenValidationError('Upload the image first — the address must be an https link.');
    }
    const altText = this.cleanAltText(input.altText);
    await this.assertMachine(input.businessId, input.machineId);

    const group = (await kioskScreenImageRepository.listByScope(input.businessId, input.machineId)).filter((row) => row.data.placement === input.placement);
    const spec = KIOSK_SCREEN_PLACEMENTS[input.placement];
    if (group.length >= spec.maxImages) {
      throw new KioskScreenValidationError(`${spec.label} already has ${spec.maxImages} images here. Remove one before adding another.`);
    }
    const nextOrder = group.reduce((max, row) => Math.max(max, row.data.displayOrder + 1), 0);

    return kioskScreenImageRepository.create({
      businessId: input.businessId,
      placement: input.placement,
      machineId: input.machineId,
      imageUrl,
      altText,
      displayOrder: nextOrder,
      active: true,
      createdBy: input.actor,
    });
  }

  async updateImage(businessId: string, imageId: string, fields: { altText?: string; active?: boolean }, actor: string): Promise<void> {
    const update: { altText?: string; active?: boolean } = {};
    if (fields.altText !== undefined) {
      update.altText = this.cleanAltText(fields.altText);
    }
    if (fields.active !== undefined) {
      update.active = fields.active;
    }
    await kioskScreenImageRepository.update(businessId, imageId, update, actor);
  }

  /**
   * Moves one image a step earlier or later in its rotation. The whole
   * group is renumbered, so gaps or ties left by deletions never make a
   * move appear to do nothing.
   */
  async moveImage(businessId: string, imageId: string, direction: 'earlier' | 'later', actor: string): Promise<void> {
    const image = await kioskScreenImageRepository.findById(businessId, imageId);
    if (!image) {
      throw new KioskScreenValidationError('That image no longer exists.');
    }
    const group = (await kioskScreenImageRepository.listByScope(businessId, image.machineId))
      .filter((row) => row.data.placement === image.placement)
      .sort(byOrder)
      .map((row) => row.id);
    const index = group.indexOf(imageId);
    const target = direction === 'earlier' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= group.length) {
      return;
    }
    [group[index], group[target]] = [group[target], group[index]];
    await kioskScreenImageRepository.setOrder(group, actor);
  }

  async deleteImage(businessId: string, imageId: string): Promise<void> {
    await kioskScreenImageRepository.delete(businessId, imageId);
  }

  /**
   * What one machine's screen shows, per placement: the machine's own
   * active images when it has any for that placement, otherwise the
   * fleet-wide active images. An empty list means the screen draws its
   * built-in design for that placement.
   */
  async resolveForMachine(businessId: string, machineId: string): Promise<KioskScreenContent> {
    const [own, fleet] = await Promise.all([
      kioskScreenImageRepository.listByScope(businessId, machineId),
      kioskScreenImageRepository.listByScope(businessId, null),
    ]);
    const content = {} as KioskScreenContent;
    for (const placement of KIOSK_SCREEN_PLACEMENT_KEYS) {
      const pick = (rows: typeof own) => rows.filter((row) => row.data.placement === placement && row.data.active).sort(byOrder);
      const chosen = pick(own).length > 0 ? pick(own) : pick(fleet);
      content[placement] = chosen.map((row) => ({ imageUrl: row.data.imageUrl, altText: row.data.altText }));
    }
    return content;
  }
}

export const kioskScreenService = new KioskScreenService();
export { KioskScreenService };
