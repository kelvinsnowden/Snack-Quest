'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MAX_REFERRAL_CODE_LENGTH,
  messageForRejection,
  normalizeReferralCode,
  rejectionFor,
} from '@/lib/creators/chosenReferralCode';

/**
 * Choosing a referral code, and being told straight away whether it is
 * free (§ creators choose their own code).
 *
 * Codes used to be generated — six letters of your name plus four
 * random digits — which is fine for a link and awful for something you
 * say out loud on camera. A creator who wants SNACKS should be able to
 * ask for SNACKS.
 *
 * Optional on purpose. Somebody signing up at eleven at night has not
 * decided on their brand, and making them invent one before they can
 * finish is a worse trade than giving them a generated code.
 *
 * Everything about the *shape* of a code is decided during render from
 * the value itself — no state, no request, no delay, so a space or an
 * over-long code is answered as it is typed. Only "has somebody taken
 * it" needs the server, and that is the one thing this holds state
 * for.
 *
 * It does not gate the submit button. The server claims the code
 * atomically and will say so if it lost a race, and this codebase has
 * already decided (see the checkout) that a disabled button is silent
 * under a tap where a live one can explain itself.
 */

/** Long enough that a normal typing rhythm produces one request, not one per letter. */
const DEBOUNCE_MS = 400;

type RemoteAnswer = {
  /** Which code this answer is about, so a stale reply can be ignored. */
  code: string;
  result: 'available' | 'taken' | 'unknown';
  message?: string;
};

export function ReferralCodeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [answer, setAnswer] = useState<RemoteAnswer | null>(null);
  /*
   * Which request is current. An earlier, slower check must not
   * overwrite the answer for what is now in the box — that is how a
   * field ends up saying "available" about a code the person has
   * already typed past.
   */
  const requestId = useRef(0);

  const code = normalizeReferralCode(value);
  const rejection = code ? rejectionFor(code) : null;
  const shouldCheck = Boolean(code) && !rejection;

  useEffect(() => {
    if (!shouldCheck) {
      return;
    }
    const id = requestId.current + 1;
    requestId.current = id;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/creator/referral-code?code=${encodeURIComponent(code)}`);
        const payload = (await response.json()) as
          | { available: true }
          | { available: false; message: string };
        if (requestId.current !== id) return;
        setAnswer(
          payload.available
            ? { code, result: 'available' }
            : { code, result: 'taken', message: payload.message },
        );
      } catch {
        if (requestId.current !== id) return;
        /*
         * A failed check is not a taken code. Signing up stays
         * possible — the claim is atomic server-side, so the worst
         * case is being told there, which beats a dropped request
         * blocking a legitimate sign-up.
         */
        setAnswer({ code, result: 'unknown' });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [code, shouldCheck]);

  /*
   * Derived, not stored: an answer only counts while it is about the
   * code currently in the box. Anything else is "still checking",
   * which is exactly what it is.
   */
  const current = answer?.code === code ? answer : null;
  const state: 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'unknown' = !code
    ? 'idle'
    : rejection
      ? 'invalid'
      : (current?.result ?? 'checking');

  const message =
    state === 'invalid'
      ? messageForRejection(rejection!)
      : state === 'taken'
        ? (current?.message ?? 'That code is already taken. Try another.')
        : state === 'available'
          ? `${code} is yours — nobody else is using it.`
          : state === 'checking'
            ? 'Checking whether it’s free…'
            : state === 'unknown'
              ? 'Couldn’t check that just now — you can still continue.'
              : 'Or leave it blank and we’ll make one up for you.';

  const tone =
    state === 'available'
      ? 'text-success'
      : state === 'invalid' || state === 'taken'
        ? 'text-danger'
        : 'text-muted-foreground';

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="referralCode">
        Choose your code <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>

      {/*
        Says what the box is for, and stays put.
        Before this, the only explanation lived in the status line
        below — which is replaced by "Checking…" the moment anybody
        types, so the one sentence describing the field disappeared
        exactly when it was being used. Worse, that sentence was
        "leave blank and we'll make one for you", which answers the
        question nobody was asking: it told people how to opt out of a
        choice they had not realised they were being offered.
        The label said "Your code", which reads as a code being handed
        to you rather than one you get to pick.
      */}
      <p id="referralCode-help" className="text-muted-foreground -mt-1 text-sm">
        This is the code you say on camera, and the one your audience types at checkout. Pick
        something short you can spell out loud — your name or your handle usually works.
      </p>

      <div className="relative">
        <Input
          id="referralCode"
          name="referralCode"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          // Stored and matched upper-case, so showing it any other way
          // would be showing something that is not what they get.
          className="pr-10 uppercase"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={MAX_REFERRAL_CODE_LENGTH + 6}
          placeholder="SNACKS"
          disabled={disabled}
          // Both, in reading order: what the field is for, then how
          // this particular code is doing.
          aria-describedby="referralCode-help referralCode-status"
        />
        <span className="absolute inset-y-0 right-3 flex items-center">
          {state === 'checking' ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
          ) : state === 'available' ? (
            <Check className="text-success size-4" aria-hidden="true" />
          ) : state === 'taken' || state === 'invalid' ? (
            <X className="text-danger size-4" aria-hidden="true" />
          ) : null}
        </span>
      </div>

      {/*
        One live region for every outcome, so a screen reader hears the
        verdict change rather than only sighted users seeing the icon.
      */}
      <p id="referralCode-status" aria-live="polite" className={`text-sm ${tone}`}>
        {message}
      </p>
    </div>
  );
}
