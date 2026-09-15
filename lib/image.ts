// Browser-side image preparation: resize and re-encode before upload so files stay small.
export type ImageKind = 'logo' | 'banner' | 'avatar';
const limits: Record<ImageKind, { maxWidth: number; maxHeight: number; quality: number }> = {
  logo: { maxWidth: 512, maxHeight: 512, quality: 0.9 },
  banner: { maxWidth: 1800, maxHeight: 700, quality: 0.85 },
  avatar: { maxWidth: 320, maxHeight: 320, quality: 0.88 },
};

export async function prepareImage(file: File, kind: ImageKind): Promise<File> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|svg\+xml|avif|heic)$/.test(file.type)) throw new Error('Choisissez une image (PNG, JPEG, WebP…).');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Image illisible.'); });
  const { maxWidth, maxHeight, quality } = limits[kind];
  // Profile pictures are squared from the centre; other images keep their proportions.
  const side = Math.min(bitmap.width, bitmap.height);
  const source = kind === 'avatar' ? { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, w: side, h: side } : { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  const scale = Math.min(1, maxWidth / source.w, maxHeight / source.h);
  const width = Math.max(1, Math.round(source.w * scale)), height = Math.max(1, Math.round(source.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, source.x, source.y, source.w, source.h, 0, 0, width, height);
  bitmap.close();
  // Logos keep transparency (PNG); banners are photos (WebP, JPEG fallback).
  const type = kind === 'logo' ? 'image/png' : kind === 'avatar' ? 'image/jpeg' : 'image/webp';
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
