'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export interface MapPoint { id: string; lat: number; lng: number; title: string; color?: string }

const CAIRO: [number, number] = [30.0444, 31.2357];

/** خريطة OpenStreetMap لعرض نقاط البلاغات (markers دوائر بدون صور) */
export default function MapView({ points, height = 420 }: { points: MapPoint[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: any;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current).setView(points[0] ? [points[0].lat, points[0].lng] : CAIRO, points.length ? 8 : 6);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; مساهمو OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      const group: any[] = [];
      points.forEach((p) => {
        const m = L.circleMarker([p.lat, p.lng], {
          radius: 9, color: '#fff', weight: 2, fillColor: p.color ?? '#0d8758', fillOpacity: 0.95,
        }).addTo(map);
        const a = document.createElement('a');
        a.href = `/report/${p.id}`;
        a.textContent = p.title;
        a.style.fontWeight = '700';
        m.bindPopup(a);
        group.push(m);
      });
      if (group.length > 1) map.fitBounds(L.featureGroup(group).getBounds().pad(0.2));
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [points]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-2xl ring-1 ring-stone-300" />;
}
