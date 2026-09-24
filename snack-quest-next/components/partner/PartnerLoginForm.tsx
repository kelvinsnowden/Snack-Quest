'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getIdTokenResult,
} from 'firebase/auth';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { clientAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/creator/PasswordInput';

/**
 * The Owner Portal's own sign-in (§ PART 2 — OWNER PORTAL,
 * § partner authentication). Same pattern as `CreatorLoginForm`:
 * Firebase Client SDK owns the credential, this component never sees
 * or validates a password itself; the ID token is exchanged for an
 * httpOnly session cookie server-side.
 *
 * One real difference from the creator flow, handled in a single
 * form rather than two separate pages: a partner's *account* may not
 * exist in Firebase Auth yet even though their *partner record*
 * already does (staff created it with a contact email before the
 * owner ever visits this page). So "sign in" here first tries
 * `signInWithEmailAndPassword` — the account already exists, this is
 * a returning owner — and only on Firebase's own "no such account"
 * error does it fall back to creating one and claiming the matching
 * partner record via `POST /api/vending/partners/auth/register`.
 * A wrong password on an existing account still fails as a wrong
 * password; it's specifically "this email has never signed up" that
 * triggers the claim path, not any and every sign-in failure.
 */
export function PartnerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function establishSession(path: string, idToken: string): Promise<boolean> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Could not sign you in. Please try again.');
      return false;
    }
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      let idToken: string;
      let newAccountUser: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user'] | null = null;
      try {
        const credential = await signInWithEmailAndPassword(clientAuth, email, password);
        idToken = (await getIdTokenResult(credential.user)).token;
      } catch (signInError) {
        const code = (signInError as { code?: string }).code;
        if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential') {
          throw signInError;
        }
        const credential = await createUserWithEmailAndPassword(clientAuth, email, password);
        idToken = (await getIdTokenResult(credential.user)).token;
        newAccountUser = credential.user;
      }

      const path = newAccountUser ? '/api/vending/partners/auth/register' : '/api/vending/partners/auth/session';
      const ok = await establishSession(path, idToken);
      if (!ok) {
        if (newAccountUser) {
          // No matching unclaimed partner for this email — never leave a
          // stranded Firebase Auth account behind that a real owner
          // could never sign in with later, once Snack Quest actually
          // does provision them.
          await newAccountUser.delete().catch(() => undefined);
        }
        setSubmitting(false);
        return;
      }

      const destination = searchParams.get('next') || '/partner';
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
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          disabled={submitting}
        />
        <p className="text-xs text-muted-foreground">First time here? Enter the email Snack Quest has on file for your account and choose a password — we&apos;ll set it up.</p>
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
