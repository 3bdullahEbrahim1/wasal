'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/dashboard';
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabase();
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        if (data.session) {
          router.push(next);
          router.refresh();
        } else {
          setMsg({ ok: true, text: 'اتبعتلك إيميل تأكيد. افتحه وبعدها سجّل دخول.' });
        }
      }
    } catch (err: any) {
      const m = String(err?.message ?? '');
      setMsg({
        ok: false,
        text: m.includes('Invalid login') ? 'الإيميل أو الباسورد غلط.'
          : m.includes('already registered') ? 'الإيميل ده مسجل قبل كده. سجّل دخول.'
          : m.includes('Email not confirmed') ? 'لازم تأكد الإيميل الأول من الرسالة اللي وصلتك.'
          : m.includes('Password should') ? 'الباسورد لازم يبقى 6 حروف على الأقل.'
          : m.includes('rate limit') ? 'محاولات كتير. استنى شوية وجرّب تاني.'
          : 'حصل خطأ. جرّب تاني.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <form onSubmit={submit} className="card space-y-4">
        <h1 className="text-2xl font-extrabold">{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}</h1>
        <div>
          <label className="label">الإيميل</label>
          <input className="input" type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">الباسورد</label>
          <input className="input" type="password" required minLength={6} dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {msg && (
          <p className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>
        )}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '...' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
        <button
          type="button"
          className="w-full text-sm font-bold text-brand-700 hover:underline"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(null); }}
        >
          {mode === 'login' ? 'معنديش حساب؟ سجّل دلوقتي' : 'عندي حساب؟ سجّل دخول'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
