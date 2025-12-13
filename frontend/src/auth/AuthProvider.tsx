// frontend/src/auth/AuthProvider.tsx
import React, { useEffect, useState } from "react";
import { apiClient } from "../api/api";
import { AuthContext } from "./useAuth";
import type { SignupResponse } from "./useAuth";

type User = {
  id: string;
  email: string;
  name?: string | null;
  isVerified?: boolean;
} | null;

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const api = apiClient();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get("/auth/me");
        if (mounted) setUser(res.data.user ?? null);
      } catch (e) {
        console.error("Failed to fetch /auth/me", e);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * login: attempts to login. If server returns 403 (unverified) or 401,
   * the error will bubble up to the caller so the UI can show messages.
   */
  const login = async (email: string, password: string) => {
    await api.post("/api/auth/login", { email, password });
    // after successful login, refresh /me to get full user object (including isVerified)
    const me = await api.get("/auth/me");
    setUser(me.data.user ?? null);
    return me.data.user;
  };

  /**
   * signup: calls signup endpoint which now sends verification email and
   * does NOT sign the user in. We return the server response so UI can show message.
   */
  const signup = async (
    name: string,
    email: string,
    password: string
  ): Promise<SignupResponse> => {
    const res = await api.post("/auth/signup", {
      name,
      email,
      password,
    });
    // do NOT call /auth?action=me or setUser — user must verify email first
    return res.data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      console.warn("Logout error", e);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, api, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
