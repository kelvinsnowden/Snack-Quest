import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { kioskScreenService } from '@/services/kioskScreenService';
import { kioskExperienceService } from '@/services/kioskExperienceService';
import { advertisingService } from '@/services/advertisingService';
import { stableHash } from '@/lib/kiosk/experienceConfig';
import type { MachinePlaylist } from '@/lib/ads/playlist';
import type { KioskExperienceConfig, KioskScreenContent } from '@/types';

export interface KioskContentPackage {
  /** Changes whenever anything in the package changes; the screen sends it back as `have` and gets `unchanged` if nothing did. */
  packageVersion: string;
  experience: { config: KioskExperienceConfig; version: string };
  screen: KioskScreenContent;
  /** Campaigns this machine may play on its idle screen, with each creative's address and checksum (§ PLAYLIST, § OFFLINE CACHE). */
  ads: MachinePlaylist;
}

/**
 * Everything a machine's screen shows besides the menu itself (§ CONTENT
 * SYNC): the published design, the screen artwork and the ad playlist, in one versioned
 * package. The screen swaps the whole package at once, so it never shows
 * half an update.
 */
class KioskContentService {
  async packageFor(businessId: string, machineId: string): Promise<KioskContentPackage> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);
    const [experience, screen] = await Promise.all([kioskExperienceService.resolveForMachine(businessId, machineId, machine), kioskScreenService.resolveForMachine(businessId, machineId)]);
    const ads = await advertisingService.playlistForMachine(businessId, machineId, machine, experience.config.idle.adsEnabled);
    const packageVersion = `p${stableHash(`${experience.version}|${JSON.stringify(screen)}|${ads.version}`)}`;
    return { packageVersion, experience: { config: experience.config, version: experience.version }, screen, ads };
  }
}

export const kioskContentService = new KioskContentService();
