'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { clientAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/creator/PasswordInput';
import { ForgotPasswordDialog } from '@/components/creator/ForgotPasswordDialog';
import { rememberCreator, useRememberedCreator } from '@/lib/creator/rememberedIdentity';

/**
 * Real creator sign-in (§ Creator Portal auth) — same pattern as
 * `components/admin/LoginForm.tsx`: Firebase Client SDK checks the
 * password, this component never sees or validates it itself. The
 * resulting ID token is exchanged for an httpOnly session cookie via
 * `POST /api/creator/session`, which also confirms the uid is
 * actually a provisioned creator.
 */
export function CreatorLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const remembered = useRememberedCreator();
  const [emailInput, setEmailInput] = useState('');
  // Prefill from a remembered prior login on this device — a plain
  // derived fallback rather than seeding state in an effect, so
  // nothing ever overwrites what someone's actually typed.
  const email = emailInput || remembered?.email || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The password was right but this account has no creator profile —
  // a different problem from a bad password, and one the person can
  // fix themselves by finishing sign-up on the same email. Tracked
  // separately so the message can carry that link.
  const [notACreator, setNotACreator] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotACreator(false);
    setSubmitting(true);

    try {
      const credential = await signInWithEmailAndPassword(clientAuth, email, password);
      const idToken = await credential.user.getIdToken();

      const response = await fetch('/api/creator/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 403) {
          setNotACreator(true);
        } else {
          setError(data.error ?? 'Could not sign you in. Please try again.');
        }
        setSubmitting(false);
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        session?: { displayName?: string };
      };
      if (data.session?.displayName) {
        rememberCreator({ displayName: data.session.displayName, email });
      }

      const destination = searchParams.get('next') || '/creator';
      router.replace(destination);
      router.refresh();
    } catch {
      setError('That email and password combination is incorrect.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmailInput(event.target.value)}
          placeholder="you@example.com"
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          disabled={submitting}
        />
      </div>

      {notACreator ? (
        <p role="alert" className="bg-danger/10 text-danger flex items-start gap-2 rounded-md px-3 py-2 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            That password is right, but this email isn&apos;t in the Creator Program yet.{' '}
            <Link
              href={`/creator/register?email=${encodeURIComponent(email)}`}
              className="font-medium underline underline-offset-4"
            >
              Finish signing up
            </Link>{' '}
            with the same email and password — it keeps this account.
          </span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={submitting} className="mt-1">
        {!submitting ? <LogIn aria-hidden="true" /> : null}
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="text-center">
        <ForgotPasswordDialog defaultEmail={email} />
      </div>

      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/creator/register" className="font-medium text-primary hover:underline">
          Create a creator account
        </Link>
      </p>
    </form>
  );
}

export function CreatorLoginFormFallback() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="h-4 w-16 rounded bg-border/60" />
        <div className="h-10 rounded-md bg-border/40" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-20 rounded bg-border/60" />
        <div className="h-10 rounded-md bg-border/40" />
      </div>
      <div className="mt-1 flex h-12 items-center justify-center rounded-md bg-border/40">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
