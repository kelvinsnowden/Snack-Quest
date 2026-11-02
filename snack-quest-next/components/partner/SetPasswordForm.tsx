'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/creator/PasswordInput';

const MIN_LENGTH = 8;

/**
 * Create (or replace) an owner's password from the link Snack Quest emailed
 * them. Their email is shown, not asked for: it's the one they'll sign in
 * with. Done, it takes them to sign-in with the email filled in.
 */
export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const longEnough = password.length >= MIN_LENGTH;
  const matches = password.length > 0 && password === confirm;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!longEnough) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (!matches) {
      setError('The two passwords don’t match.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/owner-login/set-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { email?: string; error?: string };
      if (!response.ok || !data.email) {
        setError(data.error ?? 'Couldn’t create your password. Please try again.');
        setSubmitting(false);
        return;
      }
      router.replace(`/partner/login?email=${encodeURIComponent(data.email)}&passwordSet=1`);
    } catch {
      setError('No connection. Check your internet and try again.');
      setSubmitting(false);
    }
  }

  const rule = (ok: boolean, text: string) => (
    <li className={`flex items-center gap-1.5 ${ok ? 'text-success' : 'text-muted-foreground'}`}>
      <Check className={`size-3.5 ${ok ? 'opacity-100' : 'opacity-30'}`} aria-hidden="true" />
      {text}
    </li>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Your login email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" value={email} readOnly className="bg-border/20" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Create a password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Type it again</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
            setError(null);
          }}
          disabled={submitting}
        />
        <ul className="flex flex-col gap-1 text-xs" aria-live="polite">
          {rule(longEnough, `At least ${MIN_LENGTH} characters`)}
          {rule(matches, 'Both passwords match')}
        </ul>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={submitting} className="mt-1">
        {!submitting ? <KeyRound aria-hidden="true" /> : null}
        {submitting ? 'Creating your password…' : 'Create password'}
      </Button>
    </form>
  );
}
