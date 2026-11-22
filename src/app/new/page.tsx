'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import GeoSelect from '@/components/GeoSelect';
import MapPicker from '@/components/MapPicker';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/hooks';
import { CATEGORIES, TYPE_LABEL, isPerson } from '@/lib/labels';
import { compressImage, loadImage } from '@/lib/images';
import { faceDescriptor, imageEmbedding, toVector } from '@/lib/match';
import type { ReportType } from '@/lib/types';

const MAX_PHOTOS = 4;

function NewReport() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user, loading } = useUser();

  const initialType = (sp.get('type') as ReportType) || 'missing_person';
  const [step, setStep] = useState(1);
  const [type, setType] = useState<ReportType>(
    initialType in TYPE_LABEL ? initialType : 'missing_person',
  );
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [lastSeen, setLastSeen] = useState('');
  const [gov, setGov] = useState('');
  const [area, setArea] = useState('');
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [consent, setConsent] = useState(true);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const person = isPerson(type);
  const minor = person && age !== '' && Number(age) < 18;

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith('image/'));
    setFiles((cur) => [...cur, ...imgs].slice(0, MAX_PHOTOS));
  }

  function validate(s: number): string {
    if (s === 2) {
      if (person && !name.trim() && !description.trim()) return 'اكتب الاسم أو وصف للشخص.';
      if (!person && !title.trim()) return 'اكتب عنوان قصير للغرض (مثال: موبايل سامسونج أسود).';
      if (age !== '' && (Number(age) < 0 || Number(age) > 120)) return 'السن غير صحيح.';
    }
    if (s === 3) {
      if (!gov) return 'اختار المحافظة.';
      if (!phone.trim() && !whatsapp.trim()) return 'اكتب رقم تواصل واحد على الأقل (بيظهر للمسجلين بس).';
      if (!agree) return 'لازم توافق على الشروط وسياسة الخصوصية.';
    }
    return '';
  }

  function next() {
    const e = validate(step);
    setError(e);
    if (!e) setStep(step + 1);
  }

  async function submit() {
    const e = validate(3) || validate(2);
    if (e) { setError(e); return; }
    if (!user) return;
    setBusy(true);
    setError('');
    const sb = supabase();
    try {
      setProgress('بنحفظ البلاغ...');
      const finalTitle = title.trim() || `${TYPE_LABEL[type]}${name.trim() ? ' - ' + name.trim() : ''}`;
      const { data: rep, error: insErr } = await sb
        .from('reports')
        .insert({
          type,
          title: finalTitle,
          description: description.trim() || null,
          name: name.trim() || null,
          age: age !== '' ? Number(age) : null,
          gender: gender || null,
          category: !person ? category || null : null,
          governorate_id: Number(gov),
          area_id: area ? Number(area) : null,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
          last_seen_at: lastSeen ? new Date(lastSeen).toISOString() : null,
          consent_biometric: person && consent && files.length > 0,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;
      const reportId = rep.id as string;

      await sb.from('report_contacts').insert({
        report_id: reportId,
        contact_phone: phone.trim() || null,
        contact_whatsapp: whatsapp.trim() || null,
      });

      let noFace = 0;
      for (let i = 0; i < files.length; i++) {
        setProgress(`بنرفع الصورة ${i + 1} من ${files.length}...`);
        const { blob, objectUrl } = await compressImage(files[i]);
        const path = `${user.id}/${reportId}/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from('report-photos').upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        const { data: ph, error: phErr } = await sb
          .from('report_photos')
          .insert({ report_id: reportId, storage_path: path })
          .select('id')
          .single();
        if (phErr) throw phErr;

        // استخراج البصمة جوه المتصفح — لو فشل، البلاغ يكمّل عادي
        try {
          if (person && consent) {
            setProgress(`بنحلّل الصورة ${i + 1} للمطابقة...`);
            const img = await loadImage(objectUrl);
            const d = await faceDescriptor(img);
            if (d) {
              await sb.from('report_face_embeddings').insert({
                report_id: reportId, photo_id: ph.id, embedding: toVector(d),
              });
            } else noFace++;
          } else if (!person) {
            setProgress(`بنحلّل الصورة ${i + 1} للمطابقة...`);
            const emb = await imageEmbedding(objectUrl);
            await sb.from('report_image_embeddings').insert({
              report_id: reportId, photo_id: ph.id, embedding: toVector(emb),
            });
          }
        } catch (err) {
          console.warn('embedding failed', err);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }

      setProgress('بندوّر على تطابقات...');
      const { data: matches } = await sb.rpc('record_matches', { p_report_id: reportId });
      const n = Array.isArray(matches) ? matches.length : 0;
      router.push(`/report/${reportId}?created=1&matches=${n}${noFace ? '&noface=1' : ''}`);
    } catch (err: any) {
      console.error(err);
      setError(
        String(err?.message ?? '').includes('الحد اليومي')
          ? 'وصلت للحد اليومي من البلاغات (10).'
          : 'حصل خطأ وإحنا بنحفظ البلاغ. جرّب تاني.',
      );
      setBusy(false);
      setProgress('');
    }
  }

  if (loading) return <p className="text-stone-500">بنحمّل...</p>;
  if (!user) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <h1 className="text-xl font-extrabold">سجّل دخولك الأول</h1>
        <p className="mt-1 text-sm text-stone-600">لازم حساب عشان تنشر بلاغ وتتابع التطابقات.</p>
        <Link href="/login?next=/new" className="btn-primary mt-4">تسجيل الدخول / حساب جديد</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2 text-sm font-bold">
        {['النوع', 'التفاصيل', 'المكان والتواصل'].map((t, i) => (
          <div key={t} className={`flex-1 rounded-full py-1.5 text-center ${step === i + 1 ? 'bg-brand-600 text-white' : step > i + 1 ? 'bg-brand-100 text-brand-700' : 'bg-stone-200 text-stone-500'}`}>
            {i + 1}. {t}
          </div>
        ))}
      </div>

      <div className="card space-y-4">
        {step === 1 && (
          <>
            <h1 className="text-xl font-extrabold">إيه اللي حصل؟</h1>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(TYPE_LABEL) as ReportType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-2xl p-4 text-right font-bold ring-2 ${type === t ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-stone-200 hover:ring-stone-300'}`}
                >
                  {t === 'missing_person' ? '🔎 ' : t === 'found_person' ? '🤝 ' : t === 'lost_item' ? '📦 ' : '🎒 '}
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-xl font-extrabold">{TYPE_LABEL[type]}</h2>
            {person ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">الاسم {type === 'found_person' && '(لو معروف)'}</label>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">السن (تقريبي)</label>
                    <input className="input" type="number" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">النوع</label>
                    <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="">غير محدد</option>
                      <option value="male">ذكر</option>
                      <option value="female">أنثى</option>
                    </select>
                  </div>
                </div>
                {minor && (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    بما إن الشخص أقل من 18 سنة، صوره بتتراجع من الإدارة قبل ما تظهر للناس. البلاغ نفسه بيظهر فورًا.
                  </p>
                )}
              </>
            ) : (
              <>
                <div>
                  <label className="label">عنوان قصير *</label>
                  <input className="input" placeholder="مثال: محفظة جلد سودا" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className="label">الفئة</label>
                  <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">اختار</option>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="label">{person ? 'وصف (الملابس، علامات مميزة، آخر مكان...)' : 'وصف (اللون، الماركة، علامات مميزة...)'}</label>
              <textarea className="input min-h-28" maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="label">{type.startsWith('missing') || type === 'lost_item' ? 'آخر مرة اتشاف / اتفقد فيها' : 'تاريخ ووقت العثور'}</label>
              <input className="input" type="datetime-local" max={new Date().toISOString().slice(0, 16)} value={lastSeen} onChange={(e) => setLastSeen(e.target.value)} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-xl font-extrabold">المكان والصور والتواصل</h2>
            <GeoSelect gov={gov} area={area} requiredGov onChange={(g, a) => { setGov(g); setArea(a); }} />
            <MapPicker value={loc} onChange={setLoc} />

            <div>
              <label className="label">صور ({files.length}/{MAX_PHOTOS}) — الصورة بتساعد المطابقة التلقائية</label>
              <div className="flex flex-wrap gap-2">
                {previews.map((u, i) => (
                  <div key={u} className="relative h-24 w-24 overflow-hidden rounded-xl ring-1 ring-stone-300">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                      className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
                      aria-label="حذف الصورة"
                    >✕</button>
                  </div>
                ))}
                {files.length < MAX_PHOTOS && (
                  <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-stone-300 text-2xl text-stone-400 hover:border-brand-500">
                    +
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                  </label>
                )}
              </div>
            </div>

            {person && files.length > 0 && (
              <label className="flex gap-2 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
                <span>
                  أوافق على استخراج بصمة الوجه من الصورة (بتتحسب على جهازك) ومقارنتها مع بلاغات الأشخاص المقابلة عشان الموقع يقترح تطابقات.
                  لو مش موافق، البلاغ بينشر عادي بدون مطابقة بالصور.
                </span>
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">رقم الموبايل</label>
                <input className="input" dir="ltr" inputMode="tel" maxLength={20} placeholder="01xxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="label">واتساب (لو مختلف)</label>
                <input className="input" dir="ltr" inputMode="tel" maxLength={20} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-stone-500">أرقام التواصل بتظهر للمستخدمين المسجلين بس، مش للزوار.</p>

            <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
              <span>
                قريت ووافقت على <Link href="/terms" target="_blank" className="font-bold text-brand-700 underline">الشروط</Link> و
                <Link href="/privacy" target="_blank" className="font-bold text-brand-700 underline">سياسة الخصوصية</Link>، وأؤكد إن البيانات صحيحة.
              </span>
            </label>
          </>
        )}

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {busy && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{progress}</p>}

        <div className="flex justify-between gap-2">
          {step > 1 ? (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setError(''); setStep(step - 1); }}>السابق</button>
          ) : <span />}
          {step < 3 ? (
            <button type="button" className="btn-primary" onClick={next}>التالي</button>
          ) : (
            <button type="button" className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'استنى...' : 'نشر البلاغ'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NewReportPage() {
  return (
    <Suspense fallback={null}>
      <NewReport />
    </Suspense>
  );
}
