import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { planogramTemplateRepository } from '@/repositories/planogramTemplateRepository';
import { machineSlotService } from '@/services/machineSlotService';

export class PlanogramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanogramError';
  }
}

/**
 * Planogram templates (§ F5): save a machine's slot layout under a name,
 * apply it to other machines. Applying goes through
 * `machineSlotService.applyLayout`, so a slot still holding stock never
 * changes product, and stock is never copied — only what goes where and
 * at what price.
 */
class PlanogramService {
  async saveFromMachine(businessId: string, machineId: string, input: { name: unknown; suitsFor?: unknown }, actor: string): Promise<string> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 80) throw new PlanogramError('Give the template a name (up to 80 characters).');
    const suitsFor = typeof input.suitsFor === 'string' && input.suitsFor.trim() ? input.suitsFor.trim().slice(0, 60) : null;
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);
    const slots = await machineSlotRepository.listByMachine(businessId, machineId);
    if (slots.length === 0) throw new PlanogramError(`${machine.machineCode} has no slots set up to save.`);
    return planogramTemplateRepository.create({
      businessId,
      name,
      suitsFor,
      sourceMachineCode: machine.machineCode,
      createdBy: actor,
      slots: slots
        .map(({ slotCode, productId, productCatalogue, priceKes, capacity, position }) => ({ slotCode, productId, productCatalogue, priceKes, capacity, position }))
        .sort((a, b) => a.position - b.position),
    });
  }

  async apply(businessId: string, templateId: string, machineId: string, actor: string): Promise<{ copied: string[] }> {
    const template = await planogramTemplateRepository.findById(businessId, templateId);
    if (!template) throw new PlanogramError('That template no longer exists.');
    return machineSlotService.applyLayout(businessId, machineId, template.slots, { includePrices: true, actor });
  }
}

export const planogramService = new PlanogramService();
