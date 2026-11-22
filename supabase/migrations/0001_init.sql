-- ============================================================================
-- وَصَل (WASAL) — المخطط الأساسي لقاعدة البيانات
-- شغّله مرة واحدة على مشروع Supabase جديد (SQL Editor أو MCP apply_migration).
-- مكتوب من استخدامات الكود في src/ — لو غيّرت الكود حدّث الملف ده.
-- ============================================================================

-- ---------- الإضافات ----------
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists vector   with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- تطبيع النص العربي (للبحث والمطابقة) ----------
-- يشيل التشكيل والتطويل، ويوحّد الهمزات والتاء المربوطة والألف المقصورة
create or replace function public.wasal_norm(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(
      lower(coalesce(t, '')),
      'أإآٱةى',
      'ااااهي'
    ),
    '[ً-ْـ]', '', 'g'
  ))
$$;

-- ---------- الجداول ----------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.governorates (
  id      int primary key,
  name_ar text not null,
  name_en text not null
);

create table public.areas (
  id             serial primary key,
  governorate_id int  not null references public.governorates (id) on delete cascade,
  name_ar        text not null,
  unique (governorate_id, name_ar)
);

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type              text not null check (type in ('missing_person','found_person','lost_item','found_item')),
  status            text not null default 'open' check (status in ('open','resolved','closed')),
  title             text not null check (char_length(title) between 2 and 200),
  description       text check (char_length(description) <= 4000),
  name              text check (char_length(name) <= 200),
  age               int  check (age between 0 and 120),
  gender            text check (gender in ('male','female')),
  category          text,
  governorate_id    int  not null references public.governorates (id),
  area_id           int  references public.areas (id),
  lat               double precision check (lat between -90 and 90),
  lng               double precision check (lng between -180 and 180),
  last_seen_at      timestamptz,
  is_hidden         boolean not null default false,
  photos_approved   boolean not null default true,
  consent_biometric boolean not null default false,
  created_at        timestamptz not null default now()
);

create table public.report_contacts (
  report_id        uuid primary key references public.reports (id) on delete cascade,
  contact_phone    text,
  contact_whatsapp text
);

create table public.report_photos (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports (id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

create table public.report_messages (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 2 and 2000),
  created_at timestamptz not null default now()
);

create table public.abuse_flags (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text not null check (char_length(reason) between 3 and 1000),
  created_at  timestamptz not null default now(),
  unique (report_id, reporter_id)
);

-- بصمات الوجوه (face-api: 128 بُعد) والصور (CLIP: 512 بُعد)
create table public.report_face_embeddings (
  id        uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  photo_id  uuid references public.report_photos (id) on delete cascade,
  embedding extensions.vector(128) not null
);

create table public.report_image_embeddings (
  id        uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  photo_id  uuid references public.report_photos (id) on delete cascade,
  embedding extensions.vector(512) not null
);

create table public.report_matches (
  id          uuid primary key default gen_random_uuid(),
  report_a    uuid not null references public.reports (id) on delete cascade,
  report_b    uuid not null references public.reports (id) on delete cascade,
  score       numeric not null,
  face_score  numeric,
  image_score numeric,
  data_score  numeric,
  created_at  timestamptz not null default now(),
  check (report_a < report_b),
  unique (report_a, report_b)
);

-- ---------- الفهارس ----------
create index reports_gov_status_idx   on public.reports (governorate_id, status, created_at desc);
create index reports_user_idx         on public.reports (user_id, created_at desc);
create index reports_type_idx         on public.reports (type, status);
create index reports_name_trgm_idx    on public.reports using gin (public.wasal_norm(name) extensions.gin_trgm_ops);
create index reports_title_trgm_idx   on public.reports using gin (public.wasal_norm(title) extensions.gin_trgm_ops);
create index areas_gov_idx            on public.areas (governorate_id);
create index photos_report_idx        on public.report_photos (report_id);
create index messages_report_idx      on public.report_messages (report_id, created_at desc);
create index face_emb_report_idx      on public.report_face_embeddings (report_id);
create index image_emb_report_idx     on public.report_image_embeddings (report_id);
create index matches_a_idx            on public.report_matches (report_a);
create index matches_b_idx            on public.report_matches (report_b);
-- vector-indexes
create index face_emb_hnsw_idx  on public.report_face_embeddings  using hnsw (embedding extensions.vector_l2_ops);
create index image_emb_hnsw_idx on public.report_image_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- ---------- دوال مساعدة ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- أول أدمن: الحساب اللي إيميله 3bdo2414@gmail.com — بعد تأكيد الإيميل بس
-- (عشان محدش يسجّل بالإيميل ده من غير ما يملكه ويبقى أدمن)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_email constant text := '3bdo2414@gmail.com';
begin
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    lower(coalesce(new.email, '')) = admin_email and new.email_confirmed_at is not null
  )
  on conflict (id) do update
    set is_admin = public.profiles.is_admin
                   or (lower(coalesce(new.email, '')) = admin_email and new.email_confirmed_at is not null);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public.handle_new_user();

-- قبل الإدراج: صاحب البلاغ من الجلسة، حد يومي 10 بلاغات، ومراجعة صور القاصرين
create or replace function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id   := auth.uid();
    new.is_hidden := false;
    new.status    := 'open';
    if (select count(*) from public.reports r
         where r.user_id = new.user_id and r.created_at > now() - interval '24 hours') >= 10 then
      raise exception 'تجاوزت الحد اليومي من البلاغات (10)' using errcode = 'P0001';
    end if;
  end if;

  -- أشخاص أقل من 18 سنة: الصور تستنى اعتماد الأدمن
  new.photos_approved := not (new.type in ('missing_person','found_person')
                              and new.age is not null and new.age < 18);
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

-- قبل التعديل: غير الأدمن مايقدرش يغيّر الملكية أو الإخفاء أو اعتماد الصور
create or replace function public.reports_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.user_id         is distinct from old.user_id
       or new.is_hidden       is distinct from old.is_hidden
       or new.photos_approved is distinct from old.photos_approved
       or new.created_at      is distinct from old.created_at then
      raise exception 'مش مسموح بتعديل الحقول دي' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger reports_before_update
  before update on public.reports
  for each row execute function public.reports_before_update();

-- ---------- الأمان (RLS) ----------
alter table public.profiles                enable row level security;
alter table public.governorates            enable row level security;
alter table public.areas                   enable row level security;
alter table public.reports                 enable row level security;
alter table public.report_contacts         enable row level security;
alter table public.report_photos           enable row level security;
alter table public.report_messages         enable row level security;
alter table public.abuse_flags             enable row level security;
alter table public.report_face_embeddings  enable row level security;
alter table public.report_image_embeddings enable row level security;
alter table public.report_matches          enable row level security;

-- profiles: كل واحد يقرا بروفايله، والأدمن يقرا الكل. مفيش تعديل من العميل.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- الجغرافيا: قراءة للجميع
create policy governorates_select on public.governorates for select using (true);
create policy areas_select        on public.areas        for select using (true);

-- reports
create policy reports_select on public.reports for select
  using (not is_hidden or user_id = auth.uid() or public.is_admin());
create policy reports_insert on public.reports for insert
  to authenticated with check (user_id = auth.uid());
create policy reports_update on public.reports for update
  to authenticated using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy reports_delete on public.reports for delete
  to authenticated using (user_id = auth.uid() or public.is_admin());

-- report_contacts: للمسجلين بس
create policy contacts_select on public.report_contacts for select
  to authenticated using (true);
create policy contacts_insert on public.report_contacts for insert
  to authenticated with check (exists (
    select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid()));
create policy contacts_update on public.report_contacts for update
  to authenticated using (exists (
    select 1 from public.reports r where r.id = report_id and (r.user_id = auth.uid() or public.is_admin())));

-- report_photos: الصور المعتمدة للجميع، وغير المعتمدة لصاحب البلاغ والأدمن
create policy photos_select on public.report_photos for select
  using (exists (
    select 1 from public.reports r
     where r.id = report_id
       and (r.photos_approved or r.user_id = auth.uid() or public.is_admin())));
create policy photos_insert on public.report_photos for insert
  to authenticated with check (exists (
    select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid()));
create policy photos_delete on public.report_photos for delete
  to authenticated using (exists (
    select 1 from public.reports r where r.id = report_id and (r.user_id = auth.uid() or public.is_admin())));

-- report_messages: أي مسجّل يبعت، وصاحب البلاغ/المُرسل/الأدمن يقرا
create policy messages_insert on public.report_messages for insert
  to authenticated with check (
    sender_id = auth.uid()
    and exists (select 1 from public.reports r where r.id = report_id and not r.is_hidden));
create policy messages_select on public.report_messages for select
  to authenticated using (
    sender_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid()));

-- abuse_flags: أي مسجّل يبلّغ، والأدمن بس يقرا ويحذف
create policy flags_insert on public.abuse_flags for insert
  to authenticated with check (reporter_id = auth.uid());
create policy flags_select on public.abuse_flags for select using (public.is_admin());
create policy flags_delete on public.abuse_flags for delete using (public.is_admin());

-- البصمات: إدراج لصاحب البلاغ بس، ومفيش select للعميل (خصوصية)
create policy face_emb_insert on public.report_face_embeddings for insert
  to authenticated with check (exists (
    select 1 from public.reports r
     where r.id = report_id and r.user_id = auth.uid() and r.consent_biometric));
create policy image_emb_insert on public.report_image_embeddings for insert
  to authenticated with check (exists (
    select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid()));

-- report_matches: قراءة لأصحاب البلاغين والأدمن، والكتابة من record_matches بس
create policy matches_select on public.report_matches for select
  to authenticated using (
    public.is_admin()
    or exists (select 1 from public.reports r
                where r.id in (report_a, report_b) and r.user_id = auth.uid()));

-- ---------- المطابقة ----------
-- الدالة الداخلية: تحسب المرشحين لبلاغ معيّن. مش متاحة للعميل مباشرة.
create or replace function public._wasal_candidates(p_report_id uuid, p_limit int default 10)
returns table (
  matched_report_id uuid,
  score             numeric,
  face_score        numeric,
  image_score       numeric,
  data_score        numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  me         public.reports%rowtype;
  opp        text;
  me_person  boolean;
begin
  select * into me from public.reports where id = p_report_id;
  if not found then return; end if;

  opp := case me.type
    when 'missing_person' then 'found_person'
    when 'found_person'   then 'missing_person'
    when 'lost_item'      then 'found_item'
    else 'lost_item'
  end;
  me_person := me.type in ('missing_person','found_person');

  return query
  with cand as (
    select r.*
      from public.reports r
     where r.type = opp
       and r.status = 'open'
       and not r.is_hidden
       and r.id <> me.id
       and r.user_id <> me.user_id
  ),
  face as (
    -- أقرب مسافة L2 بين أي وجهين (face-api: ~0.35 نفس الشخص، > 0.75 مختلف)
    select c.id as rid,
           min(a.embedding <-> b.embedding)::numeric as dist
      from cand c
      join public.report_face_embeddings b on b.report_id = c.id
      join public.report_face_embeddings a on a.report_id = me.id
     where me_person
     group by c.id
  ),
  img as (
    -- أعلى تشابه cosine بين صورتين (CLIP)
    select c.id as rid,
           max(1 - (a.embedding <=> b.embedding))::numeric as sim
      from cand c
      join public.report_image_embeddings b on b.report_id = c.id
      join public.report_image_embeddings a on a.report_id = me.id
     where not me_person
     group by c.id
  ),
  scored as (
    select
      c.id as rid,
      case when f.dist is null then null
           else round(greatest(0, least(1, (0.75 - f.dist) / 0.40)), 3) end as fs,
      case when i.sim is null then null
           else round(greatest(0, least(1, (i.sim - 0.60) / 0.30)), 3) end as isc,
      round(
        case when me_person then
              0.40 * case when me.name is not null and c.name is not null
                          then similarity(wasal_norm(me.name), wasal_norm(c.name)) else 0 end
            + 0.25 * (c.governorate_id = me.governorate_id)::int
            + 0.10 * (c.area_id is not null and c.area_id = me.area_id)::int
            + 0.15 * case when me.age is null or c.age is null then 0
                          else greatest(0, 1 - abs(me.age - c.age) / 5.0) end
            + 0.10 * (me.gender is not null and me.gender = c.gender)::int
        else
              0.40 * (me.category is not null and me.category = c.category)::int
            + 0.30 * (c.governorate_id = me.governorate_id)::int
            + 0.10 * (c.area_id is not null and c.area_id = me.area_id)::int
            + 0.20 * similarity(wasal_norm(me.title || ' ' || coalesce(me.description, '')),
                                wasal_norm(c.title  || ' ' || coalesce(c.description,  '')))
        end::numeric, 3) as ds
    from cand c
    left join face f on f.rid = c.id
    left join img  i on i.rid = c.id
  )
  select s.rid,
         round(case
                 when s.fs  is not null then 0.60 * s.fs  + 0.40 * s.ds
                 when s.isc is not null then 0.55 * s.isc + 0.45 * s.ds
                 else s.ds
               end, 3) as score,
         s.fs, s.isc, s.ds
    from scored s
   order by 2 desc
   limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

revoke all on function public._wasal_candidates(uuid, int) from public, anon, authenticated;

-- للعميل: المرشحين المحتملين (لصاحب البلاغ والأدمن بس). الحد الأدنى 30%.
create or replace function public.find_matches(p_report_id uuid, p_limit int default 6)
returns table (
  matched_report_id uuid,
  score             numeric,
  face_score        numeric,
  image_score       numeric,
  data_score        numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then return; end if;
  if not (public.is_admin()
          or exists (select 1 from public.reports r where r.id = p_report_id and r.user_id = auth.uid())) then
    return;
  end if;
  return query
    select c.* from public._wasal_candidates(p_report_id, p_limit) c where c.score >= 0.30;
end;
$$;

-- بتحفظ الأقوى (>= 50%) في report_matches وترجّعه
create or replace function public.record_matches(p_report_id uuid)
returns setof public.report_matches
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.reports r where r.id = p_report_id and r.user_id = auth.uid()) then
    return;
  end if;

  return query
  with ins as (
    insert into public.report_matches (report_a, report_b, score, face_score, image_score, data_score)
    select least(p_report_id, c.matched_report_id),
           greatest(p_report_id, c.matched_report_id),
           c.score, c.face_score, c.image_score, c.data_score
      from public._wasal_candidates(p_report_id, 10) c
     where c.score >= 0.50
    on conflict (report_a, report_b) do update
      set score = excluded.score,
          face_score = excluded.face_score,
          image_score = excluded.image_score,
          data_score = excluded.data_score
    returning *
  )
  select * from ins;
end;
$$;

-- البحث: نوع + محافظة + منطقة + نص (اسم/عنوان/وصف) — يحترم RLS
create or replace function public.search_reports(
  p_type        text default null,
  p_governorate int  default null,
  p_area        int  default null,
  p_q           text default null,
  p_limit       int  default 20,
  p_offset      int  default 0
)
returns setof public.reports
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (select nullif(wasal_norm(p_q), '') as t)
  select r.*
    from public.reports r, q
   where r.status = 'open'
     and not r.is_hidden
     and (p_type is null or r.type = p_type)
     and (p_governorate is null or r.governorate_id = p_governorate)
     and (p_area is null or r.area_id = p_area)
     and (q.t is null
          or wasal_norm(r.name)  like '%' || q.t || '%'
          or wasal_norm(r.title) like '%' || q.t || '%'
          or wasal_norm(coalesce(r.description, '')) like '%' || q.t || '%'
          or similarity(wasal_norm(r.name), q.t) > 0.3
          or similarity(wasal_norm(r.title), q.t) > 0.3)
   order by
     case when q.t is null then 0
          else greatest(similarity(wasal_norm(r.name), q.t), similarity(wasal_norm(r.title), q.t)) end desc,
     r.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0))
$$;

-- الصلاحية الافتراضية جاية من PUBLIC، فلازم نشيلها من هناك (مش من anon بس)
revoke all on function public.find_matches(uuid, int)  from public, anon;
revoke all on function public.record_matches(uuid)     from public, anon;
grant execute on function public.find_matches(uuid, int)  to authenticated;
grant execute on function public.record_matches(uuid)     to authenticated;
grant execute on function public.search_reports(text, int, int, text, int, int) to anon, authenticated;

-- ---------- التخزين (صور البلاغات) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- الرفع: داخل مجلد باسم الـ user id بتاع صاحب الصورة
create policy report_photos_upload on storage.objects for insert
  to authenticated
  with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy report_photos_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'report-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- بيانات المحافظات ----------
insert into public.governorates (id, name_ar, name_en) values
  (1,  'القاهرة',        'Cairo'),
  (2,  'الجيزة',         'Giza'),
  (3,  'الإسكندرية',     'Alexandria'),
  (4,  'القليوبية',      'Qalyubia'),
  (5,  'الشرقية',        'Sharqia'),
  (6,  'الدقهلية',       'Dakahlia'),
  (7,  'الغربية',        'Gharbia'),
  (8,  'المنوفية',       'Monufia'),
  (9,  'البحيرة',        'Beheira'),
  (10, 'كفر الشيخ',      'Kafr El Sheikh'),
  (11, 'دمياط',          'Damietta'),
  (12, 'بورسعيد',        'Port Said'),
  (13, 'الإسماعيلية',    'Ismailia'),
  (14, 'السويس',         'Suez'),
  (15, 'شمال سيناء',     'North Sinai'),
  (16, 'جنوب سيناء',     'South Sinai'),
  (17, 'الفيوم',         'Faiyum'),
  (18, 'بني سويف',       'Beni Suef'),
  (19, 'المنيا',         'Minya'),
  (20, 'أسيوط',          'Asyut'),
  (21, 'سوهاج',          'Sohag'),
  (22, 'قنا',            'Qena'),
  (23, 'الأقصر',         'Luxor'),
  (24, 'أسوان',          'Aswan'),
  (25, 'البحر الأحمر',   'Red Sea'),
  (26, 'الوادي الجديد',  'New Valley'),
  (27, 'مطروح',          'Matrouh')
on conflict (id) do nothing;

-- مناطق مبدئية (أحياء رئيسية) — كمّلها بعدين حسب الحاجة
insert into public.areas (governorate_id, name_ar) values
  (1, 'مدينة نصر'), (1, 'مصر الجديدة'), (1, 'المعادي'), (1, 'حلوان'), (1, 'شبرا'),
  (1, 'وسط البلد'), (1, 'عين شمس'), (1, 'المطرية'), (1, 'التجمع الخامس'), (1, 'الشروق'),
  (1, 'مدينة بدر'), (1, 'المقطم'), (1, 'السيدة زينب'), (1, 'الزيتون'), (1, 'النزهة'),
  (2, 'الدقي'), (2, 'المهندسين'), (2, 'العجوزة'), (2, 'فيصل'), (2, 'الهرم'),
  (2, 'إمبابة'), (2, 'بولاق الدكرور'), (2, '6 أكتوبر'), (2, 'الشيخ زايد'), (2, 'العمرانية'),
  (2, 'الوراق'), (2, 'أوسيم'), (2, 'البدرشين'), (2, 'الحوامدية'), (2, 'الصف'),
  (3, 'المنتزه'), (3, 'سيدي جابر'), (3, 'سموحة'), (3, 'العجمي'), (3, 'العطارين'),
  (3, 'محرم بك'), (3, 'برج العرب'), (3, 'ميامي'), (3, 'الورديان'), (3, 'كرموز'),
  (4, 'بنها'), (4, 'شبرا الخيمة'), (4, 'قليوب'), (4, 'القناطر الخيرية'), (4, 'الخانكة'),
  (5, 'الزقازيق'), (5, 'العاشر من رمضان'), (5, 'بلبيس'), (5, 'منيا القمح'), (5, 'أبو حماد'),
  (6, 'المنصورة'), (6, 'طلخا'), (6, 'ميت غمر'), (6, 'السنبلاوين'), (6, 'دكرنس'),
  (7, 'طنطا'), (7, 'المحلة الكبرى'), (7, 'كفر الزيات'), (7, 'زفتى'), (7, 'سمنود'),
  (8, 'شبين الكوم'), (8, 'السادات'), (8, 'منوف'), (8, 'أشمون'), (8, 'تلا'),
  (9, 'دمنهور'), (9, 'كفر الدوار'), (9, 'رشيد'), (9, 'إدكو'), (9, 'أبو حمص'),
  (10, 'كفر الشيخ'), (10, 'دسوق'), (10, 'بلطيم'), (10, 'سيدي سالم'), (10, 'فوه'),
  (11, 'دمياط'), (11, 'رأس البر'), (11, 'فارسكور'), (11, 'كفر سعد'), (11, 'دمياط الجديدة'),
  (12, 'بورفؤاد'), (12, 'حي الشرق'), (12, 'حي العرب'), (12, 'حي الضواحي'), (12, 'حي المناخ'),
  (13, 'الإسماعيلية'), (13, 'القنطرة شرق'), (13, 'القنطرة غرب'), (13, 'فايد'), (13, 'التل الكبير'),
  (14, 'السويس'), (14, 'الأربعين'), (14, 'عتاقة'), (14, 'الجناين'), (14, 'فيصل'),
  (15, 'العريش'), (15, 'الشيخ زويد'), (15, 'رفح'), (15, 'بئر العبد'), (15, 'الحسنة'),
  (16, 'شرم الشيخ'), (16, 'دهب'), (16, 'نويبع'), (16, 'طور سيناء'), (16, 'سانت كاترين'),
  (17, 'الفيوم'), (17, 'سنورس'), (17, 'إطسا'), (17, 'طامية'), (17, 'يوسف الصديق'),
  (18, 'بني سويف'), (18, 'الواسطى'), (18, 'ناصر'), (18, 'ببا'), (18, 'الفشن'),
  (19, 'المنيا'), (19, 'ملوي'), (19, 'مغاغة'), (19, 'بني مزار'), (19, 'سمالوط'),
  (20, 'أسيوط'), (20, 'ديروط'), (20, 'منفلوط'), (20, 'القوصية'), (20, 'أبنوب'),
  (21, 'سوهاج'), (21, 'أخميم'), (21, 'جرجا'), (21, 'طهطا'), (21, 'المراغة'),
  (22, 'قنا'), (22, 'نجع حمادي'), (22, 'قوص'), (22, 'دشنا'), (22, 'أبو تشت'),
  (23, 'الأقصر'), (23, 'إسنا'), (23, 'أرمنت'), (23, 'القرنة'), (23, 'الطود'),
  (24, 'أسوان'), (24, 'كوم أمبو'), (24, 'إدفو'), (24, 'دراو'), (24, 'أبو سمبل'),
  (25, 'الغردقة'), (25, 'سفاجا'), (25, 'القصير'), (25, 'مرسى علم'), (25, 'رأس غارب'),
  (26, 'الخارجة'), (26, 'الداخلة'), (26, 'الفرافرة'), (26, 'باريس'), (26, 'بلاط'),
  (27, 'مرسى مطروح'), (27, 'الحمام'), (27, 'العلمين'), (27, 'سيدي براني'), (27, 'سيوة')
on conflict do nothing;
