'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword, type AuthError } from 'firebase/auth';
import { AlertCircle, Loader2, UserPlus } from 'lucide-react';
import { clientAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIREBASE_AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account with that email already exists. Sign in instead.',
  'auth/invalid-email': 'That doesn’t look like a valid email address.',
  'auth/weak-password': 'Choose a password with at least 6 characters.',
};

/**
 * Real creator sign-up (§ Creator Portal auth): the Firebase Auth
 * account is created client-side (`createUserWithEmailAndPassword`,
 * ordinary Firebase Auth, no server involvement) and the resulting ID
 * token is immediately exchanged with `POST /api/creator/register`,
 * which is the only place `users/{uid}` and `creatorProfiles/{uid}`
 * actually get written — `firestore.rules` blocks a client from
 * writing either directly with a `creator` role/profile.
 */
export function CreatorRegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords don’t match.');
      return;
    }

    setSubmitting(true);

    try {
      const credential = await createUserWithEmailAndPassword(clientAuth, email, password);
      const idToken = await credential.user.getIdToken();

      const response = await fetch('/api/creator/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken, displayName }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not create your account. Please try again.');
        setSubmitting(false);
        return;
      }

      router.replace('/creator/onboarding');
      router.refresh();
    } catch (caught) {
      const code = (caught as AuthError | undefined)?.code;
      setError((code && FIREBASE_AUTH_ERROR_MESSAGES[code]) ?? 'Could not create your account. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Full name</Label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Amina Yusuf"
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 6 characters"
          disabled={submitting}
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
          minLength={6}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
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
        {!submitting ? <UserPlus aria-hidden="true" /> : null}
        {submitting ? 'Creating your account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already a creator?{' '}
        <Link href="/creator/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function CreatorRegisterFormFallback() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className="h-4 w-20 rounded bg-border/60" />
          <div className="h-10 rounded-md bg-border/40" />
        </div>
      ))}
      <div className="mt-1 flex h-12 items-center justify-center rounded-md bg-border/40">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
