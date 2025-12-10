import { createContext, useContext } from "react";
import { apiClient } from "../api/api";

type User = {
  id: string;
  email: string;
  name?: string | null;
  isVerified?: boolean;
} | null;

export type SignupResponse = {
  ok?: boolean;
  message?: string;
  user?: User;
};

export type AuthContextValue = {
  user: User;
  loading: boolean;
  api: ReturnType<typeof apiClient>;
  login: (email: string, password: string) => Promise<User>;
  signup: (
    name: string,
    email: string,
    password: string
  ) => Promise<SignupResponse>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
