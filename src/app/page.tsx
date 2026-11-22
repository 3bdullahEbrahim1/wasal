import Link from 'next/link';
import SearchForm from '@/components/SearchForm';
import ReportCard from '@/components/ReportCard';
import { supabaseServer } from '@/lib/supabase-server';
import type { Report } from '@/lib/types';

export const revalidate = 60;

export default async function Home() {
  const sb = supabaseServer();
  const { data } = await sb
    .from('reports')
    .select('*, governorates(name_ar), areas(name_ar)')
    .eq('status', 'open')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(12);

  const reports = (data ?? []) as any[];
  const ids = reports.map((r) => r.id);
  const { data: photos } = ids.length
    ? await sb.from('report_photos').select('report_id, storage_path').in('report_id', ids)
    : { data: [] as any[] };
  const firstPhoto = new Map<string, string>();
  (photos ?? []).forEach((p: any) => { if (!firstPhoto.has(p.report_id)) firstPhoto.set(p.report_id, p.storage_path); });

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-bl from-brand-700 to-brand-900 p-6 text-white sm:p-10">
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">فقدت حد أو حاجة؟ أو لقيت؟<br />وَصَل بيوصّل الطرفين ببعض.</h1>
        <p className="mt-3 max-w-2xl text-brand-100">
          انشر بلاغ في دقيقتين. الموقع بيقارن الصور والبيانات تلقائيًا مع كل البلاغات وبيقولك لو لقى تطابق محتمل.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/new?type=missing_person" className="btn bg-white text-brand-900 hover:bg-brand-50">🔎 بلّغ عن شخص مفقود</Link>
          <Link href="/new?type=found_person" className="btn bg-brand-500 text-white hover:bg-brand-600">🤝 لقيت شخص</Link>
          <Link href="/new?type=lost_item" className="btn bg-white/10 text-white ring-1 ring-white/40 hover:bg-white/20">📦 فقدت غرض</Link>
          <Link href="/new?type=found_item" className="btn bg-white/10 text-white ring-1 ring-white/40 hover:bg-white/20">🎒 لقيت غرض</Link>
        </div>
      </section>

      <SearchForm />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">آخر البلاغات</h2>
          <Link href="/search" className="text-sm font-bold text-brand-700 hover:underline">عرض الكل ←</Link>
        </div>
        {reports.length === 0 ? (
          <div className="card text-center text-stone-500">لسه مفيش بلاغات. كن أول من يبلّغ.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {reports.map((r) => (
              <ReportCard
                key={r.id}
                report={r as Report}
                place={[r.governorates?.name_ar, r.areas?.name_ar].filter(Boolean).join(' - ')}
                photoPath={firstPhoto.get(r.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['١', 'بلّغ', 'اكتب البيانات وارفع صورة وحدد المكان.'],
          ['٢', 'مطابقة تلقائية', 'الصور والبيانات بتتقارن مع البلاغات المقابلة.'],
          ['٣', 'تواصل', 'لو فيه تطابق محتمل، تواصل واتأكد بنفسك.'],
        ].map(([n, t, d]) => (
          <div key={n} className="card">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 font-extrabold text-brand-700">{n}</div>
            <h3 className="mt-2 font-bold">{t}</h3>
            <p className="text-sm text-stone-600">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
