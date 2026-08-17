'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  confirmPasswordReset,
  signInWithEmailAndPassword,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { clientAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Where an invited (or password-reset) staffer actually lands, per
 * `staffManagementService`'s `generateStaffPasswordLink` —
 * `handleCodeInApp: true` sends them straight here instead of
 * Firebase's bare `*.firebaseapp.com/__/auth/action` page, so setting
 * a password never leaves the app. Mirrors the one-continuous-flow
 * feel the Creator Portal already has (creators pick their password at
 * registration, no separate hosted page at all).
 */
function friendlyError(code: string): string {
  switch (code) {
    case 'auth/expired-action-code':
      return 'This invite link has expired. Ask a super admin to send you a new one.';
    case 'auth/invalid-action-code':
      return 'This invite link has already been used or is no longer valid. Ask a super admin to send you a new one.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact a super admin.';
    case 'auth/user-not-found':
      return 'No account matches this invite link anymore. Ask a super admin to send you a new one.';
    case 'auth/weak-password':
      return 'Choose a password with at least 6 characters.';
    default:
      return 'Something went wrong. Ask a super admin to send you a new invite link.';
  }
}

type Status = 'verifying' | 'ready' | 'invalid' | 'submitting' | 'success';

export function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode');

  const [status, setStatus] = useState<Status>(oobCode ? 'verifying' : 'invalid');
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    oobCode ? null : 'This link is missing its invite code. Copy the full link from your invite email or message.',
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!oobCode) {
      return;
    }
    verifyPasswordResetCode(clientAuth, oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setStatus('ready');
      })
      .catch((err: { code?: string }) => {
        setError(friendlyError(err.code ?? ''));
        setStatus('invalid');
      });
  }, [oobCode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!oobCode || !email) {
      return;
    }
    setError(null);

    if (password.length < 6) {
      setError('Choose a password with at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setStatus('submitting');
    try {
      await confirmPasswordReset(clientAuth, oobCode, password);

      // Straight into a real session in the same flow, rather than
      // making someone who just set a password type it again on
      // /admin/login a second later.
      const credential = await signInWithEmailAndPassword(clientAuth, email, password);
      const idToken = await credential.user.getIdToken();

      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Your password was set, but we could not sign you in. Try signing in from the login page.');
        setStatus('ready');
        return;
      }

      setStatus('success');
      router.replace('/admin');
      router.refresh();
    } catch (err) {
      setError(friendlyError((err as { code?: string }).code ?? ''));
      setStatus('ready');
    }
  }

  if (status === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Checking your invite link…</p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <AlertCircle className="size-8 text-danger" aria-hidden="true" />
        <p className="text-sm text-foreground">{error}</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
        <p className="text-sm text-foreground">Password set. Taking you to the Admin Portal…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Setting a password for <strong className="text-foreground">{email}</strong>.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          disabled={status === 'submitting'}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="••••••••"
          disabled={status === 'submitting'}
        />
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={status === 'submitting'} className="mt-1">
        {status !== 'submitting' ? <KeyRound aria-hidden="true" /> : null}
        {status === 'submitting' ? 'Setting password…' : 'Set password & sign in'}
      </Button>
    </form>
  );
}

export function AcceptInviteFormFallback() {
  return (
    <div className="flex flex-col items-center gap-3 py-6" aria-hidden="true">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
