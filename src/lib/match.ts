/**
 * استخراج بصمات الصور في المتصفح (مفيش سيرفر ذكاء اصطناعي):
 *  - الوجوه: face-api (128 بُعد) عبر CDN
 *  - الأغراض: CLIP (512 بُعد) عبر transformers.js من CDN
 * الصورة نفسها مش بتتبعت لأي طرف تالت غير تحميل النماذج.
 */

const FACE_API_VERSION = '1.7.14';
const FACE_API_JS = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACE_API_VERSION}/dist/face-api.js`;
const FACE_MODELS = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACE_API_VERSION}/model`;
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';

declare global {
  interface Window { faceapi?: any }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('script load failed: ' + src));
    document.head.appendChild(s);
  });
}

let facePromise: Promise<any> | null = null;
async function loadFaceApi() {
  if (!facePromise) {
    facePromise = (async () => {
      if (!window.faceapi) await loadScript(FACE_API_JS);
      const fa = window.faceapi;
      await Promise.all([
        fa.nets.tinyFaceDetector.loadFromUri(FACE_MODELS),
        fa.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODELS),
        fa.nets.faceRecognitionNet.loadFromUri(FACE_MODELS),
      ]);
      return fa;
    })().catch((e) => {
      facePromise = null;
      throw e;
    });
  }
  return facePromise;
}

/** بصمة وجه (128 رقم) أو null لو مفيش وجه واضح */
export async function faceDescriptor(img: HTMLImageElement): Promise<number[] | null> {
  const fa = await loadFaceApi();
  const det = await fa
    .detectSingleFace(img, new fa.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  if (!det) return null;
  return Array.from(det.descriptor as Float32Array).map((n) => Math.round(n * 1e5) / 1e5);
}

let clipPromise: Promise<{ processor: any; model: any; RawImage: any }> | null = null;
async function loadClip() {
  if (!clipPromise) {
    clipPromise = (async () => {
      // import ديناميكي من CDN (webpack مايلمسوش)
      const dynamicImport = new Function('u', 'return import(u)') as (u: string) => Promise<any>;
      const tf = await dynamicImport(TRANSFORMERS_URL);
      const processor = await tf.AutoProcessor.from_pretrained(CLIP_MODEL);
      const model = await tf.CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: 'q8' });
      return { processor, model, RawImage: tf.RawImage };
    })().catch((e) => {
      clipPromise = null;
      throw e;
    });
  }
  return clipPromise;
}

/** بصمة صورة غرض (512 رقم، متطبّعة) */
export async function imageEmbedding(objectUrl: string): Promise<number[]> {
  const { processor, model, RawImage } = await loadClip();
  const image = await RawImage.fromURL(objectUrl);
  const inputs = await processor(image);
  const { image_embeds } = await model(inputs);
  const v = Array.from(image_embeds.data as Float32Array);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / norm) * 1e5) / 1e5);
}

/** صيغة pgvector */
export const toVector = (a: number[]) => `[${a.join(',')}]`;
