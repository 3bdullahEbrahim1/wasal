import type { Metadata } from 'next';
import { Suspense } from 'react';
import ReportView from '@/components/ReportView';
import { supabaseServer } from '@/lib/supabase-server';
import { TYPE_LABEL } from '@/lib/labels';
import type { ReportType } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sb = supabaseServer();
  const { data: r } = await sb
    .from('reports')
    .select('title, description, type, photos_approved')
    .eq('id', id)
    .maybeSingle();
  if (!r) return { title: 'بلاغ' };
  let image: string | undefined;
  if (r.photos_approved) {
    const { data: p } = await sb.from('report_photos').select('storage_path').eq('report_id', id).limit(1);
    if (p?.[0]) {
      image = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/report-photos/${p[0].storage_path}`;
    }
  }
  const title = `${TYPE_LABEL[r.type as ReportType]}: ${r.title}`;
  const description = (r.description ?? 'شوف تفاصيل البلاغ على وَصَل وساعد في الوصول لصاحب الشأن.').slice(0, 160);
  return {
    title,
    description,
    openGraph: { title, description, images: image ? [image] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description },
  };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="text-stone-500">بنحمّل...</p>}>
      <ReportView id={id} />
    </Suspense>
  );
}
