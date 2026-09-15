// Browser-side image preparation: resize and re-encode before upload so files stay small.
export type ImageKind = 'logo' | 'banner';
const limits: Record<ImageKind, { maxWidth: number; maxHeight: number; quality: number }> = {
  logo: { maxWidth: 512, maxHeight: 512, quality: 0.9 },
  banner: { maxWidth: 1800, maxHeight: 700, quality: 0.85 },
};

export async function prepareImage(file: File, kind: ImageKind): Promise<File> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|svg\+xml|avif|heic)$/.test(file.type)) throw new Error('Choisissez une image (PNG, JPEG, WebP…).');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Image illisible.'); });
  const { maxWidth, maxHeight, quality } = limits[kind];
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // Logos keep transparency (PNG); banners are photos (WebP, JPEG fallback).
  const type = kind === 'logo' ? 'image/png' : 'image/webp';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const out = blob && blob.type === type ? blob : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!out) throw new Error('Impossible de préparer l’image.');
  return new File([out], `${kind}.${out.type.split('/')[1]}`, { type: out.type });
}

export async function uploadImage(file: File, kind: ImageKind, workspaceId: string): Promise<string> {
  const prepared = await prepareImage(file, kind);
  const body = new FormData();
  body.append('kind', kind); body.append('file', prepared);
  const response = await fetch('/api/assets', { method: 'POST', body, headers: { 'X-Workspace-Id': workspaceId } });
  const data = await response.json() as { id?: string; error?: string };
  if (!response.ok || !data.id) throw new Error(data.error || 'Envoi impossible.');
  return data.id;
}
