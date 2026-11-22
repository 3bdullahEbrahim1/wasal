'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ReportCard from '@/components/ReportCard';
import { supabase } from '@/lib/supabase';
import { useGeo, useUser } from '@/lib/hooks';
import { STATUS_LABEL } from '@/lib/labels';
import type { MatchRow, Report } from '@/lib/types';

interface Msg { id: string; report_id: string; body: string; created_at: string }

export default function Dashboard() {
  const { user, loading } = useUser();
  const geo = useGeo();
  const [mine, setMine] = useState<Report[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [matches, setMatches] = useState<{ m: MatchRow; mineId: string; other: Report }[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const sb = supabase();
    const { data: reps } = await sb.from('reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const list = (reps ?? []) as Report[];
    setMine(list);
    const myIds = list.map((r) => r.id);

    const [{ data: ms }, { data: mg }] = await Promise.all([
      sb.from('report_matches').select('*').order('score', { ascending: false }).limit(50),
      myIds.length
        ? sb.from('report_messages').select('*').in('report_id', myIds).order('created_at', { ascending: false }).limit(50)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    setMsgs((mg ?? []) as Msg[]);

    const rows = ((ms ?? []) as MatchRow[]).filter((m) => myIds.includes(m.report_a) || myIds.includes(m.report_b));
    const otherIds = rows.map((m) => (myIds.includes(m.report_a) ? m.report_b : m.report_a));
    const { data: others } = otherIds.length ? await sb.from('reports').select('*').in('id', otherIds) : { data: [] as any[] };

    const allIds = [...myIds, ...otherIds];
    const ph: Record<string, string> = {};
    if (allIds.length) {
      const { data: p } = await sb.from('report_photos').select('report_id, storage_path').in('report_id', allIds);
      (p ?? []).forEach((x: any) => { if (!ph[x.report_id]) ph[x.report_id] = x.storage_path; });
    }
    setPhotos(ph);
    setMatches(
      rows
        .map((m) => {
          const mineId = myIds.includes(m.report_a) ? m.report_a : m.report_b;
          const other = (others ?? []).find((o: any) => o.id === (mineId === m.report_a ? m.report_b : m.report_a));
          return other ? { m, mineId, other: other as Report } : null;
        })
        .filter(Boolean) as any,
    );
    setReady(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const placeOf = (r: Report) => {
    const g = geo?.govs.find((x) => x.id === r.governorate_id)?.name_ar;
    const a = geo?.areas.find((x) => x.id === r.area_id)?.name_ar;
    return [g, a].filter(Boolean).join(' - ');
  };

  if (loading) return <p className="text-stone-500">بنحمّل...</p>;
  if (!user) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="font-bold">سجّل دخولك لعرض بلاغاتك.</p>
        <Link href="/login" className="btn-primary mt-3">تسجيل الدخول</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">بلاغاتي</h1>
        <Link href="/new" className="btn-primary">+ بلاغ جديد</Link>
      </div>

      {matches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold">🔗 تطابقات محتملة لبلاغاتك</h2>
          <p className="text-xs text-stone-500">تقديرية ومش تأكيد. اتأكد بنفسك قبل أي خطوة.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {matches.map(({ m, mineId, other }) => (
              <div key={m.id} className="space-y-1">
                <p className="text-xs text-stone-500">
                  مع بلاغك: <Link className="font-bold text-brand-700" href={`/report/${mineId}`}>{mine.find((r) => r.id === mineId)?.title}</Link>
                </p>
                <ReportCard
                  report={other}
                  place={placeOf(other)}
                  photoPath={photos[other.id]}
                  extra={<span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">تطابق {Math.round(m.score * 100)}%</span>}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {!ready ? (
          <p className="text-stone-500">بنحمّل...</p>
        ) : mine.length === 0 ? (
          <div className="card text-center text-stone-500">مفيش بلاغات لسه.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {mine.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                place={placeOf(r)}
                photoPath={photos[r.id]}
                extra={
                  <p className="mt-1 text-xs font-bold text-stone-500">
                    {STATUS_LABEL[r.status]}{r.is_hidden ? ' · مخفي' : ''}{!r.photos_approved ? ' · الصور قيد المراجعة' : ''}
                  </p>
                }
              />
            ))}
          </div>
        )}
      </section>

      {msgs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold">✉️ رسائل وصلتك</h2>
          <div className="space-y-2">
            {msgs.map((m) => (
              <div key={m.id} className="card text-sm">
                <p className="text-xs text-stone-400">
                  على بلاغ: <Link className="font-bold text-brand-700" href={`/report/${m.report_id}`}>{mine.find((r) => r.id === m.report_id)?.title}</Link>
                  {' · '}{new Date(m.created_at).toLocaleString('ar-EG')}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
