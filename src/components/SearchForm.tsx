'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import GeoSelect from './GeoSelect';
import { TYPE_LABEL } from '@/lib/labels';

export default function SearchForm({
  initial,
}: {
  initial?: { type?: string; gov?: string; area?: string; q?: string };
}) {
  const router = useRouter();
  const [type, setType] = useState(initial?.type ?? '');
  const [gov, setGov] = useState(initial?.gov ?? '');
  const [area, setArea] = useState(initial?.area ?? '');
  const [q, setQ] = useState(initial?.q ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (type) p.set('type', type);
    if (gov) p.set('gov', gov);
    if (area) p.set('area', area);
    if (q.trim()) p.set('q', q.trim());
    router.push(`/search?${p.toString()}`);
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <label className="label">النوع</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <GeoSelect gov={gov} area={area} onChange={(g, a) => { setGov(g); setArea(a); }} />
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="اسم الشخص أو وصف الغرض (مثال: محمد، موبايل سامسونج...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-primary shrink-0">بحث</button>
      </div>
    </form>
  );
}
