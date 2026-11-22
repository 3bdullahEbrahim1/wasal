'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

const CAIRO: [number, number] = [30.0444, 31.2357];

/** اختيار موقع بالضغط على الخريطة */
export default function MapPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number }) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current) return;
      LRef.current = L;
      const map = L.map(el.current).setView(value ? [value.lat, value.lng] : CAIRO, value ? 14 : 6);
      mapRef.current = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; مساهمو OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      map.on('click', (e: any) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
      if (value) place(value.lat, value.lng);
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function place(lat: number, lng: number) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    else markerRef.current = L.circleMarker([lat, lng], {
      radius: 10, color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1,
    }).addTo(map);
  }

  useEffect(() => {
    if (value) {
      place(value.lat, value.lng);
      mapRef.current?.setView([value.lat, value.lng], Math.max(mapRef.current.getZoom(), 13));
    }
  }, [value]);

  function locateMe() {
    navigator.geolocation?.getCurrentPosition(
      (p) => onChange({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => alert('مقدرناش نحدد موقعك. اضغط على الخريطة يدويًا.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-2">
      <div ref={el} className="h-72 w-full overflow-hidden rounded-2xl ring-1 ring-stone-300" />
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{value ? `📍 ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'اضغط على الخريطة لتحديد المكان (اختياري)'}</span>
        <button type="button" onClick={locateMe} className="font-bold text-brand-700 hover:underline">استخدم موقعي الحالي</button>
      </div>
    </div>
  );
}
