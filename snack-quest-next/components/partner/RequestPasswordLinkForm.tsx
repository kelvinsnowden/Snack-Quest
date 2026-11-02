'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, MailCheck, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * "First time, or forgot your password?": emails a link to create a password
 * to the address Snack Quest has for the owner. The confirmation is the same
 * whether or not the email is an owner's, so it can't be used to find owners.
 */
export function RequestPasswordLinkForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/owner-login/password-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Couldn’t send the link. Please try again.');
      } else {
        setSentTo(email.trim());
      }
    } catch {
      setError('No connection. Check your internet and try again.');
    }
    setSubmitting(false);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <p role="status" className="flex items-start gap-2 rounded-md bg-success/10 px-3 py-2 text-success">
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Check your email.
        </p>
        <p className="text-foreground">
          If <strong>{sentTo}</strong> is the email Snack Quest has for your machines, a link to create your password is on its way. It can take a few minutes — check your spam folder too.
        </p>
        <p className="text-muted-foreground">Nothing after 10 minutes? Your owner account may use a different email. Ask Snack Quest which one.</p>
        <Button asChild variant="outline">
          <Link href="/partner/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Your email</Label>
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
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={submitting}
        />
        <p className="text-xs text-muted-foreground">Use the email Snack Quest has for your machines. We’ll send you a link to create your password.</p>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={submitting} className="mt-1">
        {!submitting ? <Send aria-hidden="true" /> : null}
        {submitting ? 'Sending…' : 'Email me a link'}
      </Button>

      <p className="text-center text-sm">
        <Link href="/partner/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
