import type { ReportType, ReportStatus } from './types';

export const TYPE_LABEL: Record<ReportType, string> = {
  missing_person: 'شخص مفقود',
  found_person: 'شخص تم العثور عليه',
  lost_item: 'غرض مفقود',
  found_item: 'غرض تم العثور عليه',
};

export const TYPE_COLOR: Record<ReportType, string> = {
  missing_person: 'bg-red-100 text-red-800',
  found_person: 'bg-emerald-100 text-emerald-800',
  lost_item: 'bg-amber-100 text-amber-800',
  found_item: 'bg-sky-100 text-sky-800',
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'مفتوح',
  resolved: 'تم العثور / تم الحل',
  closed: 'مغلق',
};

export const isPerson = (t: ReportType) => t === 'missing_person' || t === 'found_person';

export const CATEGORIES = [
  'موبايل', 'محفظة', 'مفاتيح', 'أوراق وبطاقات', 'حقيبة', 'حيوان أليف',
  'مجوهرات', 'سيارة / دراجة', 'إلكترونيات', 'ملابس', 'أخرى',
];

export function whatsappLink(phone: string, text?: string) {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '20' + d.slice(1);
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'دلوقتي';
  if (s < 3600) return `من ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `من ${Math.floor(s / 3600)} ساعة`;
  if (s < 86400 * 30) return `من ${Math.floor(s / 86400)} يوم`;
  return new Date(iso).toLocaleDateString('ar-EG');
}
