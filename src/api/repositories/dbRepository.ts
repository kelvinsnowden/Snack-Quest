import { DatabaseState, AuditLog, NotificationLog } from '../../types/database';

let dbStateRef: DatabaseState | null = null;
let saveDbCallback: (() => void) | null = null;

export function initDbRepository(state: DatabaseState, saveFn: () => void) {
  dbStateRef = state;
  saveDbCallback = saveFn;
}

export function getDb(): DatabaseState {
  if (!dbStateRef) {
    throw new Error('Database repository not initialized yet.');
  }
  return dbStateRef;
}

export function saveDb(): void {
  if (saveDbCallback) {
    saveDbCallback();
  }
}

export function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getNowIso(): string {
  return new Date().toISOString();
}

export function getDaysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function addAuditLog(
  actorType: 'user' | 'system' | 'api',
  actorId: string,
  actorName: string,
  action: string,
  entityType: string,
  entityId: string,
  description: string,
  recordId: string | null = null,
  before: any = null,
  after: any = null,
  ipAddress: string | null = null
): AuditLog {
  const db = getDb();
  const log: AuditLog = {
    id: generateUuid(),
    staff_user_id: actorId || null,
    staff_user_name: actorName || 'System / External API',
    action: (action as any) || 'update',
    table_name: entityType,
    record_id: entityId || recordId || generateUuid(),
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: after ? JSON.parse(JSON.stringify(after)) : null,
    ip_address: ipAddress || '127.0.0.1',
    created_at: getNowIso(),
    updated_at: getNowIso(),
  };
  if (!db.audit_logs) db.audit_logs = [];
  db.audit_logs.unshift(log);
  saveDb();
  return log;
}

export function addNotificationLog(
  recipientType: 'customer' | 'staff',
  recipientId: string,
  channel: 'whatsapp' | 'email' | 'sms',
  templateCode: string,
  payload: Record<string, any>,
  relatedOrderId: string | null = null
): NotificationLog {
  const db = getDb();
  const log: NotificationLog = {
    id: generateUuid(),
    recipient_type: recipientType,
    recipient_id: recipientId,
    channel,
    template_code: templateCode,
    payload,
    status: 'queued',
    related_order_id: relatedOrderId,
    sent_at: null,
    created_at: getNowIso(),
    updated_at: getNowIso(),
  };
  if (!db.notifications_log) db.notifications_log = [];
  db.notifications_log.unshift(log);
  saveDb();
  return log;
}
