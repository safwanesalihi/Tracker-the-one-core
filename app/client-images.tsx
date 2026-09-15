'use client';
// Banner + logo on the client overview, with upload / remove controls for people who may edit the client.
import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import ClientMark from '@/app/client-mark';
import { useI18n } from '@/app/locale-provider';
import { uploadImage, type ImageKind } from '@/lib/image';
import type { RecordItem } from '@/lib/model';

type Props = {
  client: RecordItem;
  workspaceId: string;
  canEdit: boolean;
  onChange: (changes: Partial<RecordItem>, message: string) => Promise<boolean>;
  onError: (message: string) => void;
};

export default function ClientImages({ client, workspaceId, canEdit, onChange, onError }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<ImageKind | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  async function pick(kind: ImageKind, file: File | undefined) {
    if (!file || busy) return;
    setBusy(kind);
    try {
      const id = await uploadImage(file, kind, workspaceId);
      await onChange({ [kind]: id }, kind === 'logo' ? t('Logo mis à jour') : t('Bannière mise à jour'));
    } catch (error) { onError(t((error as Error).message)); }
    finally { setBusy(null); if (logoInput.current) logoInput.current.value = ''; if (bannerInput.current) bannerInput.current.value = ''; }
  }
  async function remove(kind: ImageKind) {
    if (busy) return;
    setBusy(kind);
    try { await onChange({ [kind]: '' }, kind === 'logo' ? t('Logo retiré') : t('Bannière retirée')); }
    finally { setBusy(null); }
  }

  return <div className={`client-hero ${client.banner ? 'has-banner' : ''}`}>
    <div className="client-banner">
      {client.banner && <img src={`/api/assets/${client.banner}`} alt="" />}
      {canEdit && <div className="client-image-tools">
        <input ref={bannerInput} type="file" accept="image/*" hidden onChange={(e) => void pick('banner', e.target.files?.[0])} />
        <button type="button" className="btn" disabled={!!busy} onClick={() => bannerInput.current?.click()}>{busy === 'banner' ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />}{client.banner ? t('Changer la bannière') : t('Ajouter une bannière')}</button>
        {client.banner && <button type="button" className="icon-button" aria-label={t('Retirer la bannière')} disabled={!!busy} onClick={() => void remove('banner')}><Trash2 size={14} /></button>}
      </div>}
    </div>
    <div className="client-hero-mark">
      <ClientMark name={client.name} logo={client.logo} size="xl" />
      {canEdit && <div className="client-logo-tools">
        <input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => void pick('logo', e.target.files?.[0])} />
        <button type="button" className="text-link" disabled={!!busy} onClick={() => logoInput.current?.click()}>{busy === 'logo' ? <Loader2 size={13} className="spin" /> : <ImagePlus size={13} />}{client.logo ? t('Changer le logo') : t('Ajouter un logo')}</button>
        {client.logo && <button type="button" className="text-link" disabled={!!busy} onClick={() => void remove('logo')}><Trash2 size={13} />{t('Retirer')}</button>}
      </div>}
    </div>
  </div>;
}
