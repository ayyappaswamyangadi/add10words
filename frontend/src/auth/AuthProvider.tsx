import React, { useEffect, useState } from "react";
import { apiClient } from "../api/api";
import { AuthContext } from "./useAuth";

type User = { id: string; email: string } | null;

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
        const res = await api.get("/auth?action=me");
        if (mounted) setUser(res.data.user);
      } catch (e) {
        console.error("Failed to fetch /auth/me", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    await api.post("/auth?action=login", { email, password });
    const res = await api.get("/auth?action=me");
    setUser(res.data.user);
    return res.data.user;
  };

  const signup = async (email: string, password: string) => {
    await api.post("/auth?action=signup", { email, password });
    const res = await api.get("/auth?action=me");
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth?action=logout");
    } catch (e) {
      console.warn(e);
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
