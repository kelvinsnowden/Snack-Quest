'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * A creator's own profile photo (§ Creator Portal profile photos) —
 * uploads and saves immediately on file select rather than waiting
 * for `ProfileForm`'s own "Save changes": the photo is a different
 * document (`users/{uid}`, not `creatorProfiles/{uid}`) and a
 * different concern, so coupling its save to unrelated bio/niche
 * fields would mean a photo pick silently reverting if the rest of
 * the form has a validation error.
 */
export function AvatarUpload({
  photoURL,
  initials,
}: {
  photoURL: string | null;
  initials: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(photoURL);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('directory', 'creators');
      const uploadResponse = await fetch('/api/storage/upload', { method: 'POST', body: form });
      if (!uploadResponse.ok) {
        const body = (await uploadResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not upload your photo.');
      }
      const { url } = (await uploadResponse.json()) as { url: string };

      const saveResponse = await fetch('/api/creator/photo', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photoURL: url }),
      });
      if (!saveResponse.ok) {
        const body = (await saveResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save your photo.');
      }

      setPreview(url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your photo.');
      setPreview(photoURL);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        aria-label={preview ? 'Change your profile photo' : 'Add a profile photo'}
        className="group focus-visible:ring-primary focus-visible:ring-offset-background relative rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70"
      >
        <Avatar className="size-20">
          {preview ? <AvatarImage src={preview} alt="" /> : null}
          <AvatarFallback className="text-xl">{initials}</AvatarFallback>
        </Avatar>
        <span className="bg-primary text-primary-foreground ring-background absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full shadow-sm ring-2 transition-transform group-hover:scale-105">
          <Camera className="size-3.5" aria-hidden="true" />
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={onFileSelected}
      />
      {error ? (
        <p role="alert" className="text-danger max-w-[220px] text-center text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
