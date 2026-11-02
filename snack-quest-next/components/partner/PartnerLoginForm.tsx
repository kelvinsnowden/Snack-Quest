'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, getIdTokenResult } from 'firebase/auth';
import { AlertCircle, CheckCircle2, Loader2, LogIn } from 'lucide-react';
import { clientAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/creator/PasswordInput';

/** Firebase's sign-in failures, in words an owner can act on. */
function signInMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes, or get a link to set a new password.';
    case 'auth/user-disabled':
      return 'This login is turned off. Contact Snack Quest.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    default:
      return 'That email and password don’t match. Check them, or get a link to set a new password.';
  }
}

/**
 * The Owner Portal sign-in: email and the password the owner created from
 * the link Snack Quest emailed them. Signing in never creates an account —
 * a first-time owner, or one who forgot their password, gets a link from
 * "First time, or forgot your password?" (`/partner/forgot-password`).
 *
 * Firebase owns the credential; the ID token is exchanged for an httpOnly
 * session cookie server-side.
 */
export function PartnerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordJustSet = searchParams.get('passwordSet') === '1';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      let idToken: string;
      try {
        const credential = await signInWithEmailAndPassword(clientAuth, email.trim(), password);
        idToken = (await getIdTokenResult(credential.user)).token;
      } catch (signInError) {
        setError(signInMessage((signInError as { code?: string }).code));
        setSubmitting(false);
        return;
      }
      const response = await fetch('/api/vending/partners/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not sign you in. Please try again.');
        setSubmitting(false);
        return;
      }
      router.replace(searchParams.get('next') || '/partner');
      router.refresh();
    } catch {
      setError('Could not sign you in. Please try again.');
      setSubmitting(false);
    }
  }

  const linkHref = email.trim() ? `/partner/forgot-password?email=${encodeURIComponent(email.trim())}` : '/partner/forgot-password';

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {passwordJustSet ? (
        <p role="status" className="flex items-start gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Password created. Sign in with it below.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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
          autoFocus={passwordJustSet}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          disabled={submitting}
        />
      </div>

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

      <p className="text-center text-sm text-muted-foreground">
        <Link href={linkHref} className="font-medium text-primary underline-offset-4 hover:underline">
          First time, or forgot your password?
        </Link>
        <span className="mt-1 block text-xs">We’ll email you a link to create your password.</span>
      </p>
    </form>
  );
}

export function PartnerLoginFormFallback() {
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
