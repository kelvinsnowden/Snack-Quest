'use client';

import { useState, type FormEvent } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { clientAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Password reset for the Creator Portal (§ Creator Portal auth).
 *
 * There was no way to do this at all: a creator who forgot their
 * password was locked out of their own earnings permanently, with no
 * self-service path and nothing an admin could do either — Firebase
 * Auth passwords aren't readable or settable from the Admin surfaces
 * this app has.
 *
 * Plain `sendPasswordResetEmail` from the client SDK, which is the
 * whole mechanism: Firebase sends the email and hosts the reset page,
 * so there is no token to mint, store, or expire ourselves.
 *
 * Deliberately answers the same way whether or not the email has an
 * account. Saying "no account with that email" here would turn this
 * box into a way for anyone to test which of our creators' emails are
 * registered.
 */
export function ForgotPasswordDialog({ defaultEmail }: { defaultEmail?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Enter the email address you signed up with.');
      return;
    }

    setSubmitting(true);
    try {
      await sendPasswordResetEmail(clientAuth, email.trim());
      setSent(true);
    } catch {
      // Anything other than a malformed address is swallowed on
      // purpose — see the doc comment above.
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
      >
        Forgot your password?
      </button>
    );
  }

  if (sent) {
    return (
      <p className="text-success bg-success/10 flex items-start gap-2 rounded-md px-3 py-2 text-sm">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          If <span className="font-medium">{email.trim()}</span> has a Snack Quest account, a reset link is on
          its way. Check your spam folder if it doesn&apos;t arrive in a minute.
        </span>
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-email">Reset your password</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={submitting}
        />
        <p className="text-muted-foreground text-sm">
          We&apos;ll email you a link to choose a new one.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-danger flex items-start gap-2 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={submitting}>
          {!submitting ? <KeyRound aria-hidden="true" /> : null}
          Send reset link
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
