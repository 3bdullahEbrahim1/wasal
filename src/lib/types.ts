export type ReportType = 'missing_person' | 'found_person' | 'lost_item' | 'found_item';
export type ReportStatus = 'open' | 'resolved' | 'closed';

export interface Report {
  id: string;
  user_id: string;
  type: ReportType;
  status: ReportStatus;
  title: string;
  description: string | null;
  name: string | null;
  age: number | null;
  gender: 'male' | 'female' | null;
  category: string | null;
  governorate_id: number;
  area_id: number | null;
  lat: number | null;
  lng: number | null;
  last_seen_at: string | null;
  is_hidden: boolean;
  photos_approved: boolean;
  consent_biometric: boolean;
  created_at: string;
}

export interface Governorate { id: number; name_ar: string; name_en: string }
export interface Area { id: number; governorate_id: number; name_ar: string }
export interface Photo { id: string; report_id: string; storage_path: string }

export interface MatchRow {
  id: string;
  report_a: string;
  report_b: string;
  score: number;
  face_score: number | null;
  image_score: number | null;
  data_score: number | null;
  created_at: string;
}

export interface Candidate {
  matched_report_id: string;
  score: number;
  face_score: number | null;
  image_score: number | null;
  data_score: number | null;
}
