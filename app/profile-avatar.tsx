'use client';

import { initials } from '@/lib/model';

/** A person's mark: their profile picture when they set one, otherwise their initials. */
export default function Avatar({ name = '?', avatar, className = '' }: { name?: string; avatar?: string | null; className?: string }) {
  return <span className={`avatar ${avatar ? 'has-photo' : ''} ${className}`} title={name}>
    {avatar ? <img src={`/api/assets/${avatar}`} alt="" /> : initials(name || '?')}
  </span>;
}
