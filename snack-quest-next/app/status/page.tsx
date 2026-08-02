import type { Metadata } from 'next';
import { Activity, CheckCircle2, XCircle } from 'lucide-react';
import { adminFirestore } from '@/lib/firebase/admin';
import { Reveal } from '@/components/marketing/home/Reveal';

/**
 * Service status, served at `status.snackquests.shop` (§ Proper
 * subdomain routing).
 *
 * Deliberately reports only things it can actually observe on this
 * request — a live Firestore round-trip and the deployment metadata
 * Vercel injects. No uptime percentages or historical incident feed,
 * because nothing in this system records that yet and a status page
 * that invents numbers is worse than no status page at all. When real
 * uptime history exists it gets added here.
 *
 * The Firestore probe is wrapped so this page degrades to "unreachable"
 * instead of throwing: a status page that 500s during an outage fails
 * at exactly the moment it is most needed.
 */

export const metadata: Metadata = {
  title: 'Status — Snack Quest',
  description: 'Live service status for the Snack Quest platform.',
  robots: { index: false, follow: false },
};

// Every load must re-probe; a cached status page reports the past.
export const dynamic = 'force-dynamic';

type ProbeResult = {
  ok: boolean;
  latencyMs: number | null;
  detail: string;
};

async function probeFirestore(): Promise<ProbeResult> {
  const startedAt = Date.now();
  try {
    // Cheapest possible authenticated round-trip: a single-document
    // limit(1) read that does not depend on any composite index.
    await adminFirestore.collection('businesses').limit(1).get();
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      detail: 'Reads succeeding.',
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : 'Unknown error.',
    };
  }
}

function StatusPill({ ok }: { ok: boolean }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <span
      className={`text-caption inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold tracking-wide uppercase ${
        ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
      }`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {ok ? 'Operational' : 'Unreachable'}
    </span>
  );
}

export default async function StatusPage() {
  const firestore = await probeFirestore();
  const checkedAt = new Date().toISOString();

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const deployment = [
    { label: 'Environment', value: process.env.VERCEL_ENV ?? 'development' },
    { label: 'Region', value: process.env.VERCEL_REGION ?? 'local' },
    { label: 'Branch', value: process.env.VERCEL_GIT_COMMIT_REF ?? 'local' },
    { label: 'Commit', value: commitSha ? commitSha.slice(0, 7) : 'local' },
  ];

  // The application is only as available as the datastore every
  // customer-facing page reads from, so this is not a separate signal.
  const allOperational = firestore.ok;

  return (
    <div className="bg-background relative min-h-screen overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-primary/15 absolute -top-32 -left-32 size-[500px] rounded-full blur-3xl" />
        <div className="bg-secondary/15 absolute top-40 -right-32 size-[420px] rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 py-20 md:px-10 md:py-28">
        <Reveal>
          <div className="border-foreground/10 text-caption text-foreground/70 inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-1.5 font-semibold tracking-wide uppercase backdrop-blur-sm">
            <Activity className="text-primary size-3.5" aria-hidden="true" />
            Snack Quest Status
          </div>
        </Reveal>

        <Reveal delayMs={120}>
          <h1 className="font-display mt-6 text-[clamp(2.25rem,6vw,3.5rem)] leading-[0.95] font-normal tracking-tight text-balance uppercase">
            {allOperational ? (
              <>
                <span className="text-foreground">All systems </span>
                <span className="text-primary">operational.</span>
              </>
            ) : (
              <>
                <span className="text-foreground">Service </span>
                <span className="text-danger">disruption.</span>
              </>
            )}
          </h1>
        </Reveal>

        <Reveal delayMs={200}>
          <p className="text-subtitle text-foreground/75 mt-6">
            Checked live on page load.{' '}
            <time dateTime={checkedAt} className="text-foreground/60">
              {checkedAt}
            </time>
          </p>
        </Reveal>

        <section className="mt-14" aria-labelledby="components">
          <Reveal>
            <h2
              id="components"
              className="font-display text-section-title font-normal tracking-tight uppercase"
            >
              Components
            </h2>
          </Reveal>

          <Reveal delayMs={120}>
            <div className="border-border bg-surface mt-6 rounded-xl border p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-card-title text-foreground font-semibold">
                    Database
                  </h3>
                  <p className="text-small text-muted-foreground mt-1">
                    Cloud Firestore — backs every order, package and session.
                  </p>
                </div>
                <StatusPill ok={firestore.ok} />
              </div>
              <dl className="border-border text-small mt-5 flex flex-wrap gap-x-10 gap-y-3 border-t pt-4">
                <div>
                  <dt className="text-muted-foreground">Round-trip</dt>
                  <dd className="text-foreground mt-0.5 font-mono font-semibold">
                    {firestore.latencyMs === null
                      ? '—'
                      : `${firestore.latencyMs} ms`}
                  </dd>
                </div>
                <div className="min-w-0 flex-1">
                  <dt className="text-muted-foreground">Detail</dt>
                  <dd
                    className={`mt-0.5 break-words ${
                      firestore.ok ? 'text-foreground' : 'text-danger'
                    }`}
                  >
                    {firestore.detail}
                  </dd>
                </div>
              </dl>
            </div>
          </Reveal>
        </section>

        <section className="mt-14" aria-labelledby="deployment">
          <Reveal>
            <h2
              id="deployment"
              className="font-display text-section-title font-normal tracking-tight uppercase"
            >
              Deployment
            </h2>
          </Reveal>
          <Reveal delayMs={120}>
            <dl className="border-border bg-border mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-4">
              {deployment.map((item) => (
                <div key={item.label} className="bg-surface p-5">
                  <dt className="text-caption text-muted-foreground font-bold tracking-wide uppercase">
                    {item.label}
                  </dt>
                  <dd className="text-small text-foreground mt-1.5 font-mono break-all">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        <footer className="border-border mt-20 border-t pt-8">
          <p className="text-small text-muted-foreground">
            Reporting an issue?{' '}
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
