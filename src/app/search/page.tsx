'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SearchForm from '@/components/SearchForm';
import ReportCard from '@/components/ReportCard';
import MapView from '@/components/MapView';
import { supabase } from '@/lib/supabase';
import { useGeo } from '@/lib/hooks';
import type { Report } from '@/lib/types';

const PAGE = 20;
const MAP_COLOR: Record<string, string> = {
  missing_person: '#dc2626', found_person: '#059669', lost_item: '#d97706', found_item: '#0284c7',
};

function Results() {
  const sp = useSearchParams();
  const geo = useGeo();
  const type = sp.get('type') ?? '';
  const gov = sp.get('gov') ?? '';
  const area = sp.get('area') ?? '';
  const q = sp.get('q') ?? '';

  const [reports, setReports] = useState<Report[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');

  const load = useCallback(async (offset: number) => {
    const sb = supabase();
    const { data, error } = await sb.rpc('search_reports', {
      p_type: type || null,
      p_governorate: gov ? Number(gov) : null,
      p_area: area ? Number(area) : null,
      p_q: q || null,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (error) { console.error(error); return { rows: [] as Report[], ph: {} as Record<string, string> }; }
    const rows = (data ?? []) as Report[];
    const ph: Record<string, string> = {};
    if (rows.length) {
      const { data: p } = await sb.from('report_photos').select('report_id, storage_path').in('report_id', rows.map((r) => r.id));
      (p ?? []).forEach((x: any) => { if (!ph[x.report_id]) ph[x.report_id] = x.storage_path; });
    }
    return { rows, ph };
  }, [type, gov, area, q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load(0).then(({ rows, ph }) => {
      if (!alive) return;
      setReports(rows);
      setPhotos(ph);
      setMore(rows.length === PAGE);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [load]);

  async function loadMore() {
    const { rows, ph } = await load(reports.length);
    setReports((r) => [...r, ...rows]);
    setPhotos((p) => ({ ...p, ...ph }));
    setMore(rows.length === PAGE);
  }

  const placeOf = (r: Report) => {
    const g = geo?.govs.find((x) => x.id === r.governorate_id)?.name_ar;
    const a = geo?.areas.find((x) => x.id === r.area_id)?.name_ar;
    return [g, a].filter(Boolean).join(' - ');
  };

  const points = useMemo(
    () => reports.filter((r) => r.lat != null && r.lng != null).map((r) => ({
      id: r.id, lat: r.lat!, lng: r.lng!, title: r.title, color: MAP_COLOR[r.type],
    })),
    [reports],
  );

  return (
    <div className="space-y-4">
      <SearchForm key={sp.toString()} initial={{ type, gov, area, q }} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">{loading ? 'بنبحث...' : `${reports.length}${more ? '+' : ''} نتيجة`}</p>
        <div className="flex overflow-hidden rounded-xl ring-1 ring-stone-300">
          {(['list', 'map'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm font-bold ${view === v ? 'bg-brand-600 text-white' : 'bg-white'}`}
            >
              {v === 'list' ? 'قايمة' : 'خريطة'}
            </button>
          ))}
        </div>
      </div>

      {view === 'map' ? (
        points.length ? <MapView points={points} height={480} /> : (
          <div className="card text-center text-stone-500">مفيش نتائج عليها موقع على الخريطة.</div>
        )
      ) : reports.length === 0 && !loading ? (
        <div className="card text-center text-stone-500">
          مفيش نتائج. جرّب تغيّر الفلاتر أو ابحث باسم تاني.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} place={placeOf(r)} photoPath={photos[r.id]} />
          ))}
        </div>
      )}

      {more && view === 'list' && (
        <div className="text-center"><button onClick={loadMore} className="btn-ghost">تحميل المزيد</button></div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-stone-500">بنحمّل...</p>}>
      <Results />
    </Suspense>
  );
}
