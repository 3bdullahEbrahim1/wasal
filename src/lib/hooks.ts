'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Area, Governorate } from './types';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const sb = supabase();
    sb.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

export function useIsAdmin(user: User | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase()
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data?.is_admin));
  }, [user]);
  return isAdmin;
}

let geoCache: { govs: Governorate[]; areas: Area[] } | null = null;

export function useGeo() {
  const [geo, setGeo] = useState(geoCache);
  useEffect(() => {
    if (geoCache) return;
    const sb = supabase();
    Promise.all([
      sb.from('governorates').select('*').order('id'),
      sb.from('areas').select('*').order('name_ar').limit(2000),
    ]).then(([g, a]) => {
      geoCache = { govs: (g.data ?? []) as Governorate[], areas: (a.data ?? []) as Area[] };
      setGeo(geoCache);
    });
  }, []);
  return geo;
}
