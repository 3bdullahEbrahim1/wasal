/** تصغير الصورة وتحويلها JPEG قبل الرفع (بيقلل الحجم ويسرّع استخراج البصمات) */
export async function compressImage(
  file: File,
  maxSide = 1280,
  quality = 0.82,
): Promise<{ blob: Blob; objectUrl: string }> {
  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('compress failed'))), 'image/jpeg', quality),
    );
    return { blob, objectUrl: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
