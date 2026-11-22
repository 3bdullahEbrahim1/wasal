'use client';

import { useGeo } from '@/lib/hooks';

export default function GeoSelect({
  gov,
  area,
  onChange,
  requiredGov = false,
}: {
  gov: string;
  area: string;
  onChange: (gov: string, area: string) => void;
  requiredGov?: boolean;
}) {
  const geo = useGeo();
  const areas = geo?.areas.filter((a) => String(a.governorate_id) === gov) ?? [];
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label">المحافظة{requiredGov && ' *'}</label>
        <select className="input" value={gov} onChange={(e) => onChange(e.target.value, '')}>
          <option value="">{requiredGov ? 'اختار المحافظة' : 'كل المحافظات'}</option>
          {geo?.govs.map((g) => <option key={g.id} value={g.id}>{g.name_ar}</option>)}
        </select>
      </div>
      <div>
        <label className="label">المنطقة</label>
        <select className="input" value={area} disabled={!gov} onChange={(e) => onChange(gov, e.target.value)}>
          <option value="">{gov ? 'كل المناطق' : '—'}</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name_ar}</option>)}
        </select>
      </div>
    </div>
  );
}
