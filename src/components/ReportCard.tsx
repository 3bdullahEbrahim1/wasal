import Link from 'next/link';
import type { Report } from '@/lib/types';
import { TYPE_COLOR, TYPE_LABEL, timeAgo } from '@/lib/labels';
import { photoUrl } from '@/lib/supabase';

export default function ReportCard({
  report,
  place,
  photoPath,
  extra,
}: {
  report: Report;
  place?: string;
  photoPath?: string | null;
  extra?: React.ReactNode;
}) {
  return (
    <Link
      href={`/report/${report.id}`}
      className="card flex gap-3 transition hover:shadow-md hover:ring-brand-500"
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100">
        {photoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(photoPath)} alt={report.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center text-3xl text-stone-300">
            {report.type.endsWith('person') ? '👤' : '📦'}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_COLOR[report.type]}`}>
          {TYPE_LABEL[report.type]}
        </span>
        <h3 className="mt-1 truncate font-bold">{report.title}</h3>
        <p className="mt-0.5 text-sm text-stone-500">
          {place ? `📍 ${place}` : ''} {report.age ? `· ${report.age} سنة` : ''}
        </p>
        <p className="mt-0.5 text-xs text-stone-400">{timeAgo(report.created_at)}</p>
        {extra}
      </div>
    </Link>
  );
}
