import type { Metadata } from 'next';
import { KeyRound, Radio, ShieldCheck, Webhook } from 'lucide-react';
import { Reveal } from '@/components/marketing/home/Reveal';

/**
 * Integration documentation, served at `api.snackquests.shop` (§
 * Proper subdomain routing). Scoped deliberately to the *externally
 * callable* surface — the Whatchimp checkout pair and the payment /
 * courier webhooks. The `/api/admin/**` and `/api/creator/**` routes
 * are session-authenticated UI plumbing, not an integration contract,
 * so documenting them here would invite calls that can only ever 401.
 *
 * Everything below is derived from the route handlers themselves
 * (`app/api/checkout/*`, `app/api/webhooks/**`) — header names, field
 * names and status codes are the real ones, not illustrative.
 */

export const metadata: Metadata = {
  title: 'API Documentation — Snack Quest',
  description:
    'Integration reference for the Snack Quest checkout and webhook endpoints.',
  robots: { index: false, follow: false },
};

const CARD_CLASS =
  'rounded-xl border border-border bg-surface p-6 shadow-sm transition-shadow duration-300 hover:shadow-md';

const METHOD_CLASS =
  'rounded-full bg-primary/10 px-2.5 py-1 font-mono text-caption font-bold tracking-wide text-primary uppercase';

function Endpoint({
  method,
  path,
  summary,
  auth,
  request,
  responses,
}: {
  method: string;
  path: string;
  summary: string;
  auth: string;
  request: { field: string; type: string; required: boolean; note: string }[];
  responses: { code: string; meaning: string }[];
}) {
  return (
    <article className={CARD_CLASS}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={METHOD_CLASS}>{method}</span>
        <code className="text-small text-foreground font-mono break-all">
          {path}
        </code>
      </div>
      <p className="text-body text-muted-foreground mt-3">{summary}</p>

      <p className="text-small text-foreground/80 mt-4 flex items-center gap-2">
        <KeyRound
          className="text-secondary size-4 shrink-0"
          aria-hidden="true"
        />
        {auth}
      </p>

      <h4 className="text-caption text-muted-foreground mt-6 font-bold tracking-wide uppercase">
        Request body
      </h4>
      <div className="mt-2 overflow-x-auto">
        <table className="text-small w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-border border-b">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Field
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Type
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Required
              </th>
              <th scope="col" className="py-2 font-semibold">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {request.map((field) => (
              <tr
                key={field.field}
                className="border-border/60 border-b last:border-0"
              >
                <td className="text-foreground py-2 pr-4 font-mono">
                  {field.field}
                </td>
                <td className="text-muted-foreground py-2 pr-4">
                  {field.type}
                </td>
                <td className="text-muted-foreground py-2 pr-4">
                  {field.required ? 'Yes' : 'No'}
                </td>
                <td className="text-muted-foreground py-2">{field.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="text-caption text-muted-foreground mt-6 font-bold tracking-wide uppercase">
        Responses
      </h4>
      <ul className="mt-2 flex flex-col gap-1.5">
        {responses.map((response) => (
          <li key={response.code} className="text-small flex gap-3">
            <code className="text-foreground w-10 shrink-0 font-mono font-semibold">
              {response.code}
            </code>
            <span className="text-muted-foreground">{response.meaning}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

const WEBHOOKS = [
  {
    path: '/api/webhooks/daraja/{businessId}',
    purpose: 'M-Pesa STK Push result callback.',
  },
  {
    path: '/api/webhooks/daraja/{businessId}/b2c-result',
    purpose: 'B2C payout result (creator withdrawals).',
  },
  {
    path: '/api/webhooks/daraja/{businessId}/b2c-timeout',
    purpose: 'B2C payout queue timeout.',
  },
  {
    path: '/api/webhooks/daraja/{businessId}/reversal-result',
    purpose: 'Transaction reversal result (refunds).',
  },
  {
    path: '/api/webhooks/daraja/{businessId}/reversal-timeout',
    purpose: 'Transaction reversal queue timeout.',
  },
  {
    path: '/api/webhooks/jumia/{businessId}',
    purpose: 'Courier shipment status transitions.',
  },
  {
    path: '/api/webhooks/whatchimp',
    purpose:
      'Inbound WhatsApp messages. Shared across every business — the receiving phone number resolves the tenant.',
  },
];

export default function ApiDocsPage() {
  return (
    <div className="bg-background relative min-h-screen overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-primary/15 absolute -top-32 -left-32 size-[500px] rounded-full blur-3xl" />
        <div className="bg-secondary/15 absolute top-40 -right-32 size-[420px] rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl px-5 py-20 md:px-10 md:py-28">
        <Reveal>
          <div className="border-foreground/10 text-caption text-foreground/70 inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-1.5 font-semibold tracking-wide uppercase backdrop-blur-sm">
            <Radio className="text-primary size-3.5" aria-hidden="true" />
            Snack Quest API
          </div>
        </Reveal>

        <Reveal delayMs={120}>
          <h1 className="font-display mt-6 text-[clamp(2.25rem,6vw,3.5rem)] leading-[0.95] font-normal tracking-tight text-balance uppercase">
            <span className="text-foreground">Integration </span>
            <span className="text-primary">reference.</span>
          </h1>
        </Reveal>

        <Reveal delayMs={200}>
          <p className="text-subtitle text-foreground/75 mt-6 max-w-2xl">
            Everything a partner integration needs to start a checkout, confirm
            payment, and receive delivery updates. All requests and responses
            are JSON over HTTPS.
          </p>
        </Reveal>

        <Reveal delayMs={260}>
          <div className="border-border bg-surface-raised mt-8 rounded-xl border p-5">
            <h2 className="text-caption text-muted-foreground font-bold tracking-wide uppercase">
              Base URL
            </h2>
            <code className="text-body text-foreground mt-2 block font-mono break-all">
              https://snackquests.shop
            </code>
            <p className="text-small text-muted-foreground mt-3">
              Route handlers are served from the primary domain and are
              reachable on every Snack Quest hostname, including this one — the{' '}
              <code className="font-mono">api.</code> subdomain serves this
              page, not a separate API origin.
            </p>
          </div>
        </Reveal>

        <section className="mt-16" aria-labelledby="authentication">
          <Reveal>
            <h2
              id="authentication"
              className="font-display text-section-title flex items-center gap-3 font-normal tracking-tight uppercase"
            >
              <ShieldCheck
                className="text-secondary size-6"
                aria-hidden="true"
              />
              Authentication
            </h2>
          </Reveal>
          <Reveal delayMs={120}>
            <div className={`${CARD_CLASS} mt-6`}>
              <dl className="flex flex-col gap-5">
                <div>
                  <dt className="text-small text-foreground font-mono font-semibold">
                    x-checkout-api-key
                  </dt>
                  <dd className="text-small text-muted-foreground mt-1">
                    Required on both checkout endpoints. A shared secret issued
                    per integration. A missing or incorrect value returns{' '}
                    <code className="font-mono">401 unauthorized</code> before
                    the body is parsed.
                  </dd>
                </div>
                <div>
                  <dt className="text-small text-foreground font-mono font-semibold">
                    ?key= query parameter
                  </dt>
                  <dd className="text-small text-muted-foreground mt-1">
                    Verifies inbound Whatchimp webhooks. Register the webhook
                    URL with the secret already appended, or requests are
                    rejected.
                  </dd>
                </div>
                <div>
                  <dt className="text-small text-foreground font-mono font-semibold">
                    Per-business webhook secret
                  </dt>
                  <dd className="text-small text-muted-foreground mt-1">
                    Daraja and Jumia callbacks are verified against a secret
                    stored on the business record, so each tenant&apos;s
                    callbacks are independently authenticated.
                  </dd>
                </div>
              </dl>
            </div>
          </Reveal>
        </section>

        <section className="mt-16" aria-labelledby="checkout">
          <Reveal>
            <h2
              id="checkout"
              className="font-display text-section-title font-normal tracking-tight uppercase"
            >
              Checkout
            </h2>
          </Reveal>
          <div className="mt-6 flex flex-col gap-6">
            <Reveal delayMs={80}>
              <Endpoint
                method="POST"
                path="/api/checkout/start"
                summary="Opens a checkout the moment a customer selects a product in WhatsApp. Creates or resumes the conversation and returns the bot's next reply."
                auth="Requires the x-checkout-api-key header."
                request={[
                  {
                    field: 'phoneNumberId',
                    type: 'string',
                    required: true,
                    note: 'WhatsApp number that received the message; resolves the business.',
                  },
                  {
                    field: 'customerPhone',
                    type: 'string',
                    required: true,
                    note: 'Customer MSISDN in E.164 form.',
                  },
                  {
                    field: 'productId',
                    type: 'string',
                    required: true,
                    note: 'Catalog product the customer selected.',
                  },
                  {
                    field: 'quantity',
                    type: 'number',
                    required: false,
                    note: 'Must be 1 — this catalog is single-unit per checkout.',
                  },
                  {
                    field: 'referralCode',
                    type: 'string',
                    required: false,
                    note: 'Creator referral code, when the order came from a referral link.',
                  },
                  {
                    field: 'creatorAttributionId',
                    type: 'string',
                    required: false,
                    note: 'Explicit attribution override.',
                  },
                ]}
                responses={[
                  {
                    code: '200',
                    meaning:
                      'Checkout started; returns conversationId, nextStep and botReply.',
                  },
                  {
                    code: '400',
                    meaning:
                      'Malformed JSON, missing required field, or quantity other than 1.',
                  },
                  {
                    code: '401',
                    meaning: 'Missing or incorrect x-checkout-api-key.',
                  },
                  {
                    code: '404',
                    meaning:
                      'No business owns that WhatsApp number, or the product does not exist.',
                  },
                  {
                    code: '409',
                    meaning: 'Product is unavailable or out of stock.',
                  },
                ]}
              />
            </Reveal>
            <Reveal delayMs={140}>
              <Endpoint
                method="POST"
                path="/api/checkout/pay"
                summary="Called when the customer explicitly replies PAY. Triggers the M-Pesa STK Push for an existing checkout session."
                auth="Requires the x-checkout-api-key header."
                request={[
                  {
                    field: 'checkoutSessionId',
                    type: 'string',
                    required: true,
                    note: 'The conversationId returned by /api/checkout/start.',
                  },
                ]}
                responses={[
                  { code: '200', meaning: 'STK Push dispatched.' },
                  {
                    code: '400',
                    meaning: 'Malformed JSON or missing checkoutSessionId.',
                  },
                  {
                    code: '401',
                    meaning: 'Missing or incorrect x-checkout-api-key.',
                  },
                  { code: '404', meaning: 'No checkout session with that id.' },
                ]}
              />
            </Reveal>
          </div>
        </section>

        <section className="mt-16" aria-labelledby="webhooks">
          <Reveal>
            <h2
              id="webhooks"
              className="font-display text-section-title flex items-center gap-3 font-normal tracking-tight uppercase"
            >
              <Webhook className="text-secondary size-6" aria-hidden="true" />
              Webhooks
            </h2>
          </Reveal>
          <Reveal delayMs={120}>
            <p className="text-body text-muted-foreground mt-4 max-w-2xl">
              Endpoints Snack Quest exposes for providers to call. Every handler
              is idempotent — a provider retrying a delivery will not duplicate
              an order, a payout, or a refund.
            </p>
          </Reveal>
          <Reveal delayMs={180}>
            <div className={`${CARD_CLASS} mt-6 overflow-x-auto`}>
              <table className="text-small w-full min-w-[36rem] border-collapse text-left">
                <thead>
                  <tr className="border-border border-b">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Endpoint
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Purpose
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {WEBHOOKS.map((webhook) => (
                    <tr
                      key={webhook.path}
                      className="border-border/60 border-b last:border-0"
                    >
                      <td className="text-foreground py-2.5 pr-4 font-mono break-all">
                        {webhook.path}
                      </td>
                      <td className="text-muted-foreground py-2.5">
                        {webhook.purpose}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>

        <footer className="border-border mt-20 border-t pt-8">
          <p className="text-small text-muted-foreground">
            Integration support:{' '}
            <a
              className="text-primary focus-visible:ring-primary focus-visible:ring-offset-background font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              href="mailto:hello@snackquest.co"
            >
              hello@snackquest.co
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
