import 'server-only';

import { getAdminAccessToken, getAdminProjectId } from '@/lib/firebase/admin';
import { getAuthEmailConfig } from './config';

/**
 * Reads and writes the project's Identity Platform email settings —
 * the one place Firebase Authentication looks when it needs to send a
 * password-reset message (§ Integration Portal: auth email).
 *
 * There is no Admin SDK wrapper for this; it is the Identity Toolkit
 * admin REST surface, authenticated with the same service account the
 * Admin SDK already uses (`getAdminAccessToken`). That is why this
 * lives behind a Gateway like any other third-party API rather than
 * being called from a Service directly.
 *
 * A note on what "applying" means: this hands Google the SMTP
 * credentials and Google keeps them. It does not prove the SMTP server
 * accepts them — only sending real mail does that, which is why
 * `testAuthEmailConnection` reads the config back rather than claiming
 * more than it knows, and why the Admin UI tells you to send yourself
 * a real reset to finish the job.
 */

const IDENTITY_TOOLKIT_HOST = 'https://identitytoolkit.googleapis.com';

interface IdentityPlatformSmtp {
  senderEmail?: string;
  host?: string;
  port?: number;
  username?: string;
  securityMode?: string;
  // Deliberately absent from the read type: Google never returns the
  // password back, and nothing here should pretend it might.
}

export interface AuthEmailProviderState {
  /** 'CUSTOM_SMTP' once ours is in force; 'DEFAULT' while Firebase is still sending from its own firebaseapp.com address. */
  method: string;
  smtp: IdentityPlatformSmtp | null;
}

function configUrl(projectId: string, updateMask?: string): string {
  const base = `${IDENTITY_TOOLKIT_HOST}/admin/v2/projects/${encodeURIComponent(projectId)}/config`;
  return updateMask ? `${base}?updateMask=${encodeURIComponent(updateMask)}` : base;
}

/**
 * Google's errors here are structured but deeply nested, and the raw
 * body is unreadable in a toast. Surfaces the human-readable message
 * where there is one, and enough of the status to act on where there
 * isn't.
 */
async function readError(response: Response, action: string): Promise<never> {
  let detail = '';
  try {
    const body = (await response.json()) as { error?: { message?: string; status?: string } };
    detail = body.error?.message ?? body.error?.status ?? '';
  } catch {
    detail = await response.text().catch(() => '');
  }
  if (response.status === 403) {
    throw new Error(
      `${action} was refused (403). The service account needs the Firebase Authentication Admin role on this project. ${detail}`.trim(),
    );
  }
  throw new Error(`${action} failed (${response.status}). ${detail}`.trim());
}

export async function getAuthEmailProviderState(): Promise<AuthEmailProviderState> {
  const projectId = getAdminProjectId();
  const token = await getAdminAccessToken();

  const response = await fetch(configUrl(projectId), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    await readError(response, 'Reading the project email settings');
  }

  const body = (await response.json()) as {
    notification?: { sendEmail?: { method?: string; smtp?: IdentityPlatformSmtp } };
  };
  const sendEmail = body.notification?.sendEmail;
  return {
    method: sendEmail?.method ?? 'DEFAULT',
    smtp: sendEmail?.smtp ?? null,
  };
}

/**
 * Pushes the stored SMTP settings into the project so Firebase starts
 * sending through them. Called on save, so the Admin Portal is genuinely
 * where this gets set up rather than a place to record what someone
 * already typed into the Firebase Console.
 */
export async function applyAuthEmailConfig(businessId: string): Promise<void> {
  const config = await getAuthEmailConfig(businessId);
  const projectId = getAdminProjectId();
  const token = await getAdminAccessToken();

  const response = await fetch(configUrl(projectId, 'notification.sendEmail'), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      notification: {
        sendEmail: {
          method: 'CUSTOM_SMTP',
          senderEmail: config.senderEmail,
          ...(config.senderName ? { senderDisplayName: config.senderName } : {}),
          smtp: {
            senderEmail: config.senderEmail,
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            securityMode: config.securityMode,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    await readError(response, 'Saving the SMTP settings to Firebase');
  }
}

/**
 * Side-effect-free check, in the same spirit as every other provider's
 * (see `testMetaConnection` for the house rule). Confirms Google has
 * our SMTP host and sender on file and is set to use them.
 *
 * It deliberately does not claim the mail will arrive: Google accepts
 * these credentials without dialling the SMTP server, so a wrong
 * password looks identical to a right one here. The Admin card says so
 * and points at the only test that settles it — a real password reset.
 */
export async function testAuthEmailConnection(businessId: string): Promise<void> {
  const config = await getAuthEmailConfig(businessId);
  const state = await getAuthEmailProviderState();

  if (state.method !== 'CUSTOM_SMTP') {
    throw new Error(
      'Firebase is still sending its own emails from its default address. Save this integration again to push these settings to the project.',
    );
  }
  if (state.smtp?.host !== config.host) {
    throw new Error(
      `Firebase has "${state.smtp?.host ?? 'no host'}" on file, not "${config.host}". Save this integration again to push the current settings.`,
    );
  }
  if (state.smtp?.senderEmail !== config.senderEmail) {
    throw new Error(
      `Firebase is sending as "${state.smtp?.senderEmail ?? 'no sender'}", not "${config.senderEmail}". Save this integration again to push the current settings.`,
    );
  }
}
