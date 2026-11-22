# وَصَل (WASAL)

منصة عربية (RTL) للمفقودين والموجودين في مصر — أشخاص وأغراض — مع مطابقة تلقائية بالصور والبيانات.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth + Storage + pgvector) · Leaflet/OpenStreetMap · Vercel.
مفيش سيرفر منفصل: كل شيء على Vercel + Supabase.

## التشغيل محليًا
```bash
npm install
cp .env.example .env.local   # واملا المتغيرات
npm run dev
```

## المتغيرات (Vercel → Settings → Environment Variables)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (المفتاح العام anon)
- `NEXT_PUBLIC_SITE_URL` (رابط الموقع النهائي — للمعاينة عند المشاركة)

## Supabase بعد النشر
Authentication → URL Configuration: خلّي **Site URL** = رابط الموقع على Vercel وضيف نفس الرابط في Redirect URLs، وإلا روابط تأكيد الإيميل هتفتح localhost.

## إزاي المطابقة بتشتغل
- **الوجوه:** `face-api` جوه المتصفح بيطلّع 128 رقم → جدول `report_face_embeddings` (pgvector، مسافة L2).
- **الأغراض:** CLIP (`transformers.js`) جوه المتصفح بيطلّع 512 رقم → `report_image_embeddings` (cosine).
- **البيانات:** تشابه الاسم (`pg_trgm` على نص عربي مُطبَّع) + المحافظة/المنطقة + السن + النوع + الفئة.
- الدالة `find_matches` بتجمع النتيجة، و`record_matches` بتحفظ الأقوى (≥ 50%) في `report_matches`.
- مفيش قراءة مباشرة للبصمات من العميل (RLS من غير سياسة select).

## الخصوصية
- أرقام التواصل في `report_contacts` (للمسجلين بس).
- البصمة بتتخزن بموافقة صريحة (`consent_biometric`).
- صور الأقل من 18 سنة بتستنى اعتماد الأدمن (`photos_approved`).
- أول أدمن: أي حساب بإيميل `3bdo2414@gmail.com` (trigger `handle_new_user`).

## ملاحظات
- `next.config.mjs` فيه `ignoreBuildErrors` لأن أول نسخة اتكتبت بدون build محلي. شيله بعد أول build نضيف.
- نسب الوجه/الصورة محتاجة معايرة بصور حقيقية (العتبات في `find_matches`).
