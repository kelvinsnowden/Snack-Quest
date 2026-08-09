'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  type AuthError,
} from 'firebase/auth';
import { AlertCircle, Loader2, UserPlus } from 'lucide-react';
import { clientAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/creator/PasswordInput';
import { rememberCreator } from '@/lib/creator/rememberedIdentity';

const FIREBASE_AUTH_ERROR_MESSAGES: Record<string, string> = {
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
 *
 * Those are two steps, and an account that completed the first but not
 * the second used to be unrecoverable from the UI: signing up again
 * hit `auth/email-already-in-use`, and signing in hit "not registered
 * as a creator yet", so the person bounced between two pages that both
 * refused them. Anyone who already had an account for another reason —
 * an admin, or a customer — hit exactly the same wall.
 *
 * So `auth/email-already-in-use` is no longer treated as a failure. We
 * sign in with the credentials just entered and provision from that
 * token instead, which is precisely the resubmission
 * `CreatorAuthService.register()` is already written to tolerate: it
 * keys off `creatorProfiles/{uid}`, merges the `creator` role into
 * whatever roles the account already had, and answers 409 if the
 * profile genuinely exists. Only a wrong password gets an error now,
 * and it points at sign-in and password reset.
 */
export function CreatorRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState('');
  // Prefilled when sign-in sent them here because their account exists
  // but isn't a creator yet — retyping the address they just typed is
  // pure friction. A derived fallback, never seeded into state, so it
  // can't overwrite what they type.
  const [emailInput, setEmailInput] = useState('');
  const email = emailInput || searchParams.get('email') || '';
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
      let credential;
      try {
        credential = await createUserWithEmailAndPassword(clientAuth, email, password);
      } catch (caught) {
        if ((caught as AuthError | undefined)?.code !== 'auth/email-already-in-use') {
          throw caught;
        }
        // The account half exists. Finish it rather than refuse it —
        // see this component's doc comment for the dead end this
        // replaces. A wrong password lands in the catch below.
        credential = await signInWithEmailAndPassword(clientAuth, email, password);
      }

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

      rememberCreator({ displayName, email });
      router.replace('/creator/onboarding');
      router.refresh();
    } catch (caught) {
      const code = (caught as AuthError | undefined)?.code;
      // Reached only when the email is taken *and* the password given
      // doesn't open it — the one case where we genuinely can't tell
      // whether this is their account.
      const wrongPassword =
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/too-many-requests';
      setError(
        wrongPassword
          ? 'An account with that email already exists, but that password doesn’t match it. Sign in instead, or reset your password.'
          : ((code && FIREBASE_AUTH_ERROR_MESSAGES[code]) ??
            'Could not create your account. Please try again.'),
      );
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
          // Same reason as the sign-in form: mobile keyboards
          // capitalize and autocorrect email addresses otherwise.
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
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
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
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
