'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useIsAdmin, useUser } from '@/lib/hooks';
import { TYPE_LABEL } from '@/lib/labels';
import type { Report } from '@/lib/types';

interface Flag { id: string; report_id: string; reason: string; created_at: string; reports: Pick<Report, 'id' | 'title' | 'type' | 'is_hidden'> | null }

export default function Admin() {
  const { user, loading } = useUser();
  const isAdmin = useIsAdmin(user);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [pending, setPending] = useState<Report[]>([]);
  const [recent, setRecent] = useState<Report[]>([]);

  const load = useCallback(async () => {
    const sb = supabase();
    const [f, p, r] = await Promise.all([
      sb.from('abuse_flags').select('*, reports(id,title,type,is_hidden)').order('created_at', { ascending: false }).limit(100),
      sb.from('reports').select('*').eq('photos_approved', false).order('created_at', { ascending: false }),
      sb.from('reports').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setFlags((f.data ?? []) as any);
    setPending((p.data ?? []) as Report[]);
    setRecent((r.data ?? []) as Report[]);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  async function act(fn: () => PromiseLike<unknown>) { await fn(); load(); }
  const sb = () => supabase();

  if (loading) return <p className="text-stone-500">بنحمّل...</p>;
  if (!user || !isAdmin) return <div className="card text-center text-stone-600">الصفحة دي للإدارة بس.</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold">لوحة الإدارة</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">🖼 صور قيد المراجعة ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-stone-500">مفيش.</p>}
        {pending.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-2">
            <Link href={`/report/${r.id}`} className="font-bold text-brand-700">{r.title}</Link>
            <span className="text-xs text-stone-500">{TYPE_LABEL[r.type]} · {r.age} سنة</span>
            <div className="mr-auto flex gap-2">
              <button className="btn-primary !py-1.5" onClick={() => act(() => sb().from('reports').update({ photos_approved: true }).eq('id', r.id))}>اعتماد الصور</button>
              <button className="btn-ghost !py-1.5" onClick={() => act(() => sb().from('reports').update({ is_hidden: true }).eq('id', r.id))}>إخفاء البلاغ</button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">🚩 بلاغات مسيئة ({flags.length})</h2>
        {flags.length === 0 && <p className="text-sm text-stone-500">مفيش.</p>}
        {flags.map((f) => (
          <div key={f.id} className="card space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/report/${f.report_id}`} className="font-bold text-brand-700">{f.reports?.title ?? '(محذوف)'}</Link>
              {f.reports?.is_hidden && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs">مخفي</span>}
              <span className="mr-auto text-xs text-stone-400">{new Date(f.created_at).toLocaleString('ar-EG')}</span>
            </div>
            <p className="text-stone-700">السبب: {f.reason}</p>
            <div className="flex gap-2">
              <button className="btn-ghost !py-1.5" onClick={() => act(() => sb().from('abuse_flags').delete().eq('id', f.id))}>تجاهل</button>
              {f.reports && !f.reports.is_hidden && (
                <button className="btn-danger !py-1.5" onClick={() => act(() => sb().from('reports').update({ is_hidden: true }).eq('id', f.report_id))}>إخفاء البلاغ</button>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">📋 آخر البلاغات</h2>
        {recent.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/report/${r.id}`} className="font-bold text-brand-700">{r.title}</Link>
            <span className="text-xs text-stone-500">{TYPE_LABEL[r.type]}</span>
            {r.is_hidden && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs">مخفي</span>}
            <div className="mr-auto flex gap-2">
              <button className="btn-ghost !py-1.5" onClick={() => act(() => sb().from('reports').update({ is_hidden: !r.is_hidden }).eq('id', r.id))}>{r.is_hidden ? 'إظهار' : 'إخفاء'}</button>
              <button
                className="btn-danger !py-1.5"
                onClick={() => { if (confirm('حذف نهائي؟')) act(() => sb().from('reports').delete().eq('id', r.id)); }}
              >حذف</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
