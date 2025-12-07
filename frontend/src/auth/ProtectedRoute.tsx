import { type ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./useAuth";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  // Still checking session (loading)
  if (loading) return <div>Loading...</div>;

  // No user? redirect to login
  if (!user) return <Navigate to="/login" replace />;

  // User authenticated → allow page
  return children;
}
