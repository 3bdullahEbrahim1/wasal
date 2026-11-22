'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useIsAdmin, useUser } from '@/lib/hooks';

export default function Header() {
  const { user, loading } = useUser();
  const isAdmin = useIsAdmin(user);
  const router = useRouter();

  async function logout() {
    await supabase().auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-xl font-extrabold text-brand-700">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">و</span>
          وَصَل
        </Link>
        <nav className="mr-auto flex items-center gap-1 text-sm font-bold sm:gap-2">
          <Link href="/search" className="rounded-lg px-3 py-2 hover:bg-stone-100">بحث</Link>
          {isAdmin && <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-stone-100">الإدارة</Link>}
          {!loading && user && <Link href="/dashboard" className="rounded-lg px-3 py-2 hover:bg-stone-100">بلاغاتي</Link>}
          <Link href="/new" className="btn-primary !py-2">+ بلّغ</Link>
          {!loading && (user ? (
            <button onClick={logout} className="rounded-lg px-3 py-2 text-stone-500 hover:bg-stone-100">خروج</button>
          ) : (
            <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-stone-100">دخول</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
