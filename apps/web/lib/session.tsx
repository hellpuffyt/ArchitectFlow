"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, setCsrfToken } from "./api";
import type { Me } from "./api";

interface SessionState { me: Me | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<SessionState>({ me: null, loading: true, refresh: async () => {}, signOut: async () => {} });

export function SessionProvider({ children, required = true }: { children: ReactNode; required?: boolean }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const onMe = useCallback((m: Me) => { setCsrfToken(m.csrf_token); setMe(m); }, []);
  const onFail = useCallback((e: unknown) => {
    setMe(null);
    if (required && e instanceof ApiError && e.status === 401) router.replace("/login");
  }, [required, router]);
  const refresh = useCallback(async () => {
    await api.me().then(onMe, onFail).finally(() => setLoading(false));
  }, [onMe, onFail]);
  useEffect(() => {
    api.me().then(onMe, onFail).finally(() => setLoading(false));
  }, [onMe, onFail]);
  const signOut = useCallback(async () => {
    await api.logout();
    setMe(null);
    router.replace("/login");
  }, [router]);
  return <Ctx.Provider value={{ me, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
