// Deregisters a WhatsApp Business phone number from the Facebook Hosted
// System (POST /{version}/{phone-number-id}/deregister).
//
// The Graph endpoint is keyed on the *Phone-Number-ID*, not the MSISDN,
// so passing a human number like 0713157084 is a two-step operation:
// resolve the ID off the WABA first, then deregister it. This script
// does both, and refuses to guess — if the MSISDN does not match
// exactly one number on the WABA it stops rather than deregistering
// something adjacent.
//
// Deregistration is not silently reversible: the number drops off the
// WhatsApp Business Platform, in-flight conversations stop delivering,
// and bringing it back means a fresh registration with a new
// verification code (and a re-supplied two-step PIN). So this is dry
// run by default, same as scripts/retireJumiaDeliveryNetwork.mjs —
// `--commit` is the only thing that sends the POST.
//
//   WHATSAPP_ACCESS_TOKEN=... WHATSAPP_WABA_ID=... \
//     node scripts/deregisterWhatsAppNumber.mjs 0713157084            # dry run
//   WHATSAPP_ACCESS_TOKEN=... WHATSAPP_WABA_ID=... \
//     node scripts/deregisterWhatsAppNumber.mjs 0713157084 --commit   # deregister
//
// If you already know the Phone-Number-ID, skip the WABA lookup:
//   WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=123456789 \
//     node scripts/deregisterWhatsAppNumber.mjs --commit
//
// The token needs `whatsapp_business_management` on the WABA that owns
// the number. A System User token is the right kind here: a short-lived
// user token expires mid-incident, which is the worst time to discover
// it. Never commit it — pass it in the environment.
const GRAPH_HOST = 'https://graph.facebook.com';
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

// Same convention as lib/config/whatsapp.ts: international format, no
// `+` and no leading zero. A Kenyan 07XXXXXXXX is 2547XXXXXXXX.
const DEFAULT_COUNTRY_CODE = process.env.WHATSAPP_COUNTRY_CODE ?? '254';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA_ID = process.env.WHATSAPP_WABA_ID;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const rawNumber = args.find((arg) => !arg.startsWith('--'));

/** Digits only, leading zero swapped for the country code. */
function toE164Digits(input) {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }
  return digits;
}

/**
 * Graph reports failures in a single envelope shape whatever the status
 * code. Surfacing `code`/`error_subcode`/`fbtrace_id` verbatim matters:
 * those three are what Meta support asks for, and they are gone once
 * the process exits.
 */
async function graph(path, init) {
  const response = await fetch(`${GRAPH_HOST}/${API_VERSION}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body.error ?? {};
    const detail = [
      `code=${error.code ?? '?'}`,
      error.error_subcode ? `subcode=${error.error_subcode}` : null,
      error.fbtrace_id ? `fbtrace_id=${error.fbtrace_id}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    const failure = new Error(
      `${response.status} ${error.type ?? 'GraphError'}: ` +
        `${error.error_user_msg ?? error.message ?? 'unknown error'} (${detail})`,
    );
    // 429 and the 5xx family are the documented retryable ones; Meta
    // also flags them with `is_transient`. A 400/401/403/404/422 is a
    // real answer and retrying it just burns rate limit.
    failure.retryable =
      error.is_transient === true ||
      response.status === 429 ||
      response.status >= 500;
    throw failure;
  }
  return body;
}

/** Exponential backoff, retryable failures only. */
async function withRetry(operation, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!error.retryable || attempt >= attempts) {
        throw error;
      }
      const delayMs = 2 ** attempt * 1000;
      console.warn(
        `  transient failure (${error.message}) — retrying in ${delayMs / 1000}s`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function resolvePhoneNumberId(target) {
  const page = await withRetry(() =>
    graph(
      `/${WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,status&limit=100`,
    ),
  );
  const numbers = page.data ?? [];

  console.log(`Numbers on WABA ${WABA_ID}: ${numbers.length}`);
  for (const number of numbers) {
    console.log(
      `  ${number.id}  ${number.display_phone_number}  ` +
        `${number.verified_name ?? '(unnamed)'}  status=${number.status ?? '?'}`,
    );
  }

  const matches = numbers.filter(
    (number) => toE164Digits(number.display_phone_number ?? '') === target,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly 1 number on the WABA matching +${target}, found ${matches.length}. ` +
        'Refusing to guess — pass WHATSAPP_PHONE_NUMBER_ID explicitly if you know the ID.',
    );
  }
  return matches[0];
}

async function main() {
  if (!ACCESS_TOKEN) {
    throw new Error(
      'WHATSAPP_ACCESS_TOKEN is required (System User token with whatsapp_business_management).',
    );
  }
  if (!PHONE_NUMBER_ID && !rawNumber) {
    throw new Error(
      'Pass a phone number (e.g. 0713157084) or set WHATSAPP_PHONE_NUMBER_ID.',
    );
  }
  if (!PHONE_NUMBER_ID && !WABA_ID) {
    throw new Error(
      'WHATSAPP_WABA_ID is required to resolve a phone number to its Phone-Number-ID. ' +
        'Alternatively set WHATSAPP_PHONE_NUMBER_ID directly.',
    );
  }

  let phoneNumberId = PHONE_NUMBER_ID;
  let label = PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    const target = toE164Digits(rawNumber);
    console.log(`Resolving ${rawNumber} (+${target}) on WABA ${WABA_ID}...\n`);
    const match = await resolvePhoneNumberId(target);
    phoneNumberId = match.id;
    label = `${match.display_phone_number} (${match.id})`;
    console.log(`\nMatched ${label}`);
  }

  if (!COMMIT) {
    console.log(
      `\nDRY RUN — nothing sent. Would POST ${GRAPH_HOST}/${API_VERSION}/${phoneNumberId}/deregister\n` +
        'Re-run with --commit to deregister. This drops the number off the WhatsApp Business\n' +
        'Platform: messages stop delivering, and restoring it needs a fresh registration with a\n' +
        'new verification code.',
    );
    return;
  }

  console.log(`\nDeregistering ${label}...`);
  const result = await withRetry(() =>
    graph(`/${phoneNumberId}/deregister`, { method: 'POST' }),
  );

  if (result.success !== true) {
    throw new Error(
      `Graph returned 200 without success:true — got ${JSON.stringify(result)}`,
    );
  }
  console.log(`Deregistered ${label}.`);
  console.log(
    'The number is now free for re-registration. Nothing in this codebase caches registration\n' +
      'state, so no follow-up invalidation is needed.',
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  // `process.exitCode` rather than `process.exit(1)`: an abrupt exit
  // while fetch's socket is still tearing down trips a libuv assertion
  // on Windows (`!(handle->flags & UV_HANDLE_CLOSING)`, src/win/async.c)
  // — the error message prints and is then buried under a crash dump.
  // Setting the code lets the loop drain and exit on its own, which it
  // does immediately once the response body has been read.
  process.exitCode = 1;
});
