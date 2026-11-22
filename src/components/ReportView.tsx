'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import MapView from './MapView';
import ReportCard from './ReportCard';
import { supabase, photoUrl } from '@/lib/supabase';
import { useIsAdmin, useUser } from '@/lib/hooks';
import { STATUS_LABEL, TYPE_COLOR, TYPE_LABEL, timeAgo, whatsappLink } from '@/lib/labels';
import type { Candidate, Photo, Report } from '@/lib/types';

type Full = Report & { governorates: { name_ar: string } | null; areas: { name_ar: string } | null };

export default function ReportView({ id }: { id: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useUser();
  const isAdmin = useIsAdmin(user);

  const [report, setReport] = useState<Full | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [active, setActive] = useState(0);
  const [contact, setContact] = useState<{ contact_phone: string | null; contact_whatsapp: string | null } | null>(null);
  const [cands, setCands] = useState<(Candidate & { report: Report; photo?: string })[]>([]);
  const [msg, setMsg] = useState('');
  const [msgState, setMsgState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [flagState, setFlagState] = useState('');

  const isOwner = !!user && !!report && report.user_id === user.id;

  const load = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb
      .from('reports')
      .select('*, governorates(name_ar), areas(name_ar)')
      .eq('id', id)
      .maybeSingle();
    if (!data) { setNotFound(true); return; }
    setReport(data as Full);
    const { data: ph } = await sb.from('report_photos').select('*').eq('report_id', id).order('created_at');
    setPhotos((ph ?? []) as Photo[]);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // أرقام التواصل: للمسجلين بس (RLS)
  useEffect(() => {
    if (!user) { setContact(null); return; }
    supabase().from('report_contacts').select('contact_phone, contact_whatsapp').eq('report_id', id).maybeSingle()
      .then(({ data }) => setContact(data));
  }, [user, id]);

  // التطابقات المحتملة: لصاحب البلاغ والأدمن
  useEffect(() => {
    if (!report || !user || !(isOwner || isAdmin) || report.status !== 'open') return;
    (async () => {
      const sb = supabase();
      const { data } = await sb.rpc('find_matches', { p_report_id: id, p_limit: 6 });
      const list = (data ?? []) as Candidate[];
      if (!list.length) { setCands([]); return; }
      const ids = list.map((c) => c.matched_report_id);
      const [{ data: reps }, { data: ph }] = await Promise.all([
        sb.from('reports').select('*').in('id', ids),
        sb.from('report_photos').select('report_id, storage_path').in('report_id', ids),
      ]);
      const first: Record<string, string> = {};
      (ph ?? []).forEach((p: any) => { if (!first[p.report_id]) first[p.report_id] = p.storage_path; });
      setCands(
        list
          .map((c) => ({ ...c, report: (reps ?? []).find((r: any) => r.id === c.matched_report_id) as Report, photo: first[c.matched_report_id] }))
          .filter((c) => c.report),
      );
    })();
  }, [report, user, isOwner, isAdmin, id]);

  async function setStatus(status: 'open' | 'resolved') {
    await supabase().from('reports').update({ status }).eq('id', id);
    load();
  }

  async function remove() {
    if (!confirm('متأكد إنك عايز تحذف البلاغ نهائيًا؟')) return;
    const sb = supabase();
    if (photos.length) await sb.storage.from('report-photos').remove(photos.map((p) => p.storage_path));
    await sb.from('reports').delete().eq('id', id);
    router.push('/dashboard');
  }

  async function toggleHidden() {
    await supabase().from('reports').update({ is_hidden: !report!.is_hidden }).eq('id', id);
    load();
  }

  async function sendMessage() {
    if (msg.trim().length < 2) return;
    setMsgState('sending');
    const { error } = await supabase().from('report_messages').insert({ report_id: id, body: msg.trim() });
    setMsgState(error ? 'error' : 'sent');
    if (!error) setMsg('');
  }

  async function flag() {
    const reason = prompt('سبب الإبلاغ عن البلاغ ده؟ (محتوى مسيء، احتيال، بيانات غلط...)');
    if (!reason || reason.trim().length < 3) return;
    const { error } = await supabase().from('abuse_flags').insert({ report_id: id, reason: reason.trim() });
    setFlagState(error ? (error.code === '23505' ? 'بلّغت عن البلاغ ده قبل كده.' : 'حصل خطأ.') : 'شكرًا، الإدارة هتراجع البلاغ.');
  }

  if (notFound) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <h1 className="text-xl font-extrabold">البلاغ مش موجود</h1>
        <p className="mt-1 text-sm text-stone-600">ممكن يكون اتحذف، أو اتقفل، أو لسه تحت المراجعة.</p>
        <Link href="/search" className="btn-primary mt-4">رجوع للبحث</Link>
      </div>
    );
  }
  if (!report) return <p className="text-stone-500">بنحمّل...</p>;

  const place = [report.governorates?.name_ar, report.areas?.name_ar].filter(Boolean).join(' - ');
  const url = typeof window !== 'undefined' ? window.location.origin + `/report/${id}` : '';
  const shareText = `${TYPE_LABEL[report.type]}: ${report.title} — ${place}`;
  const showPendingPhotos = !report.photos_approved && !isOwner && !isAdmin;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {sp.get('created') && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
          <p className="font-extrabold">تم نشر البلاغ ✔</p>
          {Number(sp.get('matches')) > 0 ? (
            <p className="mt-1 text-sm">لقينا {sp.get('matches')} تطابق محتمل قوي! شوفهم تحت وتواصل مع صاحب البلاغ المقابل.</p>
          ) : (
            <p className="mt-1 text-sm">مفيش تطابق قوي دلوقتي. هنفضل نقارن مع أي بلاغ جديد، وانت تقدر تشارك البلاغ.</p>
          )}
          {sp.get('noface') && <p className="mt-1 text-sm text-amber-800">ملحوظة: مقدرناش نلاقي وجه واضح في بعض الصور، فمش هتتحسب في المطابقة. جرّب صورة أوضح.</p>}
        </div>
      )}
      {report.is_hidden && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">البلاغ ده مخفي من الإدارة ومش ظاهر للناس.</p>
      )}

      <article className="card space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${TYPE_COLOR[report.type]}`}>{TYPE_LABEL[report.type]}</span>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">{STATUS_LABEL[report.status]}</span>
          <span className="mr-auto text-xs text-stone-400">{timeAgo(report.created_at)}</span>
        </div>
        <h1 className="text-2xl font-extrabold">{report.title}</h1>

        {photos.length > 0 ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(photos[active].storage_path)} alt={report.title} className="max-h-[480px] w-full rounded-2xl bg-stone-100 object-contain" />
            {photos.length > 1 && (
              <div className="flex gap-2">
                {photos.map((p, i) => (
                  <button key={p.id} onClick={() => setActive(i)} className={`h-16 w-16 overflow-hidden rounded-lg ring-2 ${i === active ? 'ring-brand-500' : 'ring-transparent'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(p.storage_path)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : showPendingPhotos ? (
          <p className="rounded-xl bg-stone-100 p-4 text-center text-sm text-stone-600">صور البلاغ قيد المراجعة من الإدارة (حماية لبيانات الأطفال).</p>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {report.name && <Info k="الاسم" v={report.name} />}
          {report.age != null && <Info k="السن" v={`${report.age} سنة`} />}
          {report.gender && <Info k="النوع" v={report.gender === 'male' ? 'ذكر' : 'أنثى'} />}
          {report.category && <Info k="الفئة" v={report.category} />}
          <Info k="المكان" v={place || '—'} />
          {report.last_seen_at && <Info k="التاريخ" v={new Date(report.last_seen_at).toLocaleString('ar-EG')} />}
        </dl>
        {report.description && <p className="whitespace-pre-wrap leading-7 text-stone-700">{report.description}</p>}

        {report.lat != null && report.lng != null && (
          <MapView points={[{ id: report.id, lat: report.lat, lng: report.lng, title: report.title }]} height={240} />
        )}
      </article>

      {/* التواصل */}
      <section className="card space-y-3">
        <h2 className="font-extrabold">التواصل</h2>
        {!user ? (
          <p className="text-sm text-stone-600">
            <Link href={`/login?next=/report/${id}`} className="font-bold text-brand-700 underline">سجّل دخولك</Link> عشان تشوف أرقام التواصل وتبعت رسالة.
          </p>
        ) : contact && (contact.contact_phone || contact.contact_whatsapp) ? (
          <div className="flex flex-wrap gap-2">
            {contact.contact_phone && <a className="btn-primary" href={`tel:${contact.contact_phone}`}>📞 اتصال</a>}
            {(contact.contact_whatsapp || contact.contact_phone) && (
              <a className="btn bg-[#25d366] text-white hover:opacity-90" target="_blank" rel="noopener noreferrer"
                href={whatsappLink((contact.contact_whatsapp || contact.contact_phone)!, `بخصوص بلاغ وَصَل: ${report.title}\n${url}`)}>
                واتساب
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-stone-500">مفيش رقم تواصل متاح.</p>
        )}

        {user && !isOwner && (
          <div className="space-y-2">
            <label className="label">ابعت معلومة لصاحب البلاغ (اكتب رقمك عشان يرد عليك)</label>
            <textarea className="input min-h-20" maxLength={1000} value={msg} onChange={(e) => { setMsg(e.target.value); setMsgState('idle'); }} />
            <div className="flex items-center gap-3">
              <button className="btn-primary" disabled={msgState === 'sending' || msg.trim().length < 2} onClick={sendMessage}>إرسال</button>
              {msgState === 'sent' && <span className="text-sm text-emerald-700">اتبعتت ✔</span>}
              {msgState === 'error' && <span className="text-sm text-red-600">حصل خطأ</span>}
            </div>
          </div>
        )}
      </section>

      {/* التطابقات */}
      {cands.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-extrabold">🔗 تطابقات محتملة</h2>
          <p className="text-xs text-stone-500">
            النسب تقديرية من مقارنة الصور والبيانات. ده مش تأكيد، اتأكد بنفسك وبالتواصل المباشر قبل أي خطوة.
          </p>
          <div className="grid gap-3">
            {cands.map((c) => {
              const pct = Math.round(c.score * 100);
              return (
                <ReportCard
                  key={c.matched_report_id}
                  report={c.report}
                  photoPath={c.photo}
                  extra={
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${pct >= 75 ? 'bg-emerald-100 text-emerald-800' : pct >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'}`}>
                        {pct >= 75 ? 'تطابق قوي' : pct >= 50 ? 'تطابق محتمل' : 'تشابه'} {pct}%
                      </span>
                      {c.face_score != null && <span className="rounded-full bg-stone-100 px-2 py-0.5">وجه {Math.round(c.face_score * 100)}%</span>}
                      {c.image_score != null && <span className="rounded-full bg-stone-100 px-2 py-0.5">صورة {Math.round(c.image_score * 100)}%</span>}
                      {c.data_score != null && <span className="rounded-full bg-stone-100 px-2 py-0.5">بيانات {Math.round(c.data_score * 100)}%</span>}
                    </div>
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {/* مشاركة */}
      <section className="card flex flex-wrap items-center gap-2">
        <span className="font-extrabold">شارك البلاغ</span>
        <a className="btn bg-[#25d366] text-white hover:opacity-90" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(shareText + '\n' + url)}`}>واتساب</a>
        <a className="btn bg-[#1877f2] text-white hover:opacity-90" target="_blank" rel="noopener noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}>فيسبوك</a>
        <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(url).then(() => alert('اتنسخ الرابط'))}>نسخ الرابط</button>
      </section>

      {/* تحكم */}
      <section className="flex flex-wrap items-center gap-2">
        {(isOwner || isAdmin) && (
          <>
            {report.status === 'open'
              ? <button className="btn-primary" onClick={() => setStatus('resolved')}>✔ تم العثور / تم الحل</button>
              : <button className="btn-ghost" onClick={() => setStatus('open')}>إعادة فتح البلاغ</button>}
            <button className="btn-danger" onClick={remove}>حذف</button>
          </>
        )}
        {isAdmin && <button className="btn-ghost" onClick={toggleHidden}>{report.is_hidden ? 'إظهار' : 'إخفاء'}</button>}
        {user && !isOwner && <button className="btn-ghost mr-auto" onClick={flag}>🚩 إبلاغ عن محتوى مسيء</button>}
        {flagState && <span className="text-sm text-stone-600">{flagState}</span>}
      </section>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-400">{k}</dt>
      <dd className="font-bold">{v}</dd>
    </div>
  );
}
