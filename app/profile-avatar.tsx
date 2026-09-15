'use client';

import { initials } from '@/lib/model';

export default function Avatar({ name = '?' }: { name?: string }) {
  return <span className="avatar" title={name}>{initials(name || '?')}</span>;
}
