export class MissingTemplateParamsError extends Error {
  constructor(templateCode: string, missing: string[]) {
    super(`Template "${templateCode}" is missing required params: ${missing.join(', ')}`);
    this.name = 'MissingTemplateParamsError';
  }
}

/** Fails closed rather than sending a message with a literal `{{unfilled}}` token in it. */
export function assertRequiredParams(templateCode: string, requiredParams: string[], params: Record<string, string>): void {
  const missing = requiredParams.filter((key) => !(key in params));
  if (missing.length > 0) {
    throw new MissingTemplateParamsError(templateCode, missing);
  }
}

/** `{{token}}` substitution — the whole templating language `notificationTemplates.bodyTemplate`/`subject` use. Deliberately minimal: no conditionals/loops, matching how small every real template in the seeded catalog is. */
export function renderTemplate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in params ? params[key] : match));
}
