'use client';

import { useState } from 'react';
import { initials } from '@/lib/model';
import { googleProfileImage } from '@/lib/profile';

export default function Avatar({ name = '?', image }: { name?: string; image?: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = googleProfileImage(image);
  return <span className="avatar" title={name}>
    {src && src !== failed
      ? <img src={src} alt={`Photo de profil de ${name}`} referrerPolicy="no-referrer" onError={() => setFailed(src)} />
      : initials(name || '?')}
  </span>;
}
