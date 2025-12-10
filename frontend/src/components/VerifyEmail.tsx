// frontend/src/pages/VerifyEmail.tsx
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router";
import { apiClient } from "../api/api";
import { isAxiosError } from "axios";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function VerifyEmailPage(): JSX.Element {
  const api = apiClient();
  const navigate = useNavigate();
  const q = useQuery();
  const token = q.get("token") ?? q.get("t") ?? "";
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Verification token missing.");
      return;
    }

    let mounted = true;
    (async () => {
      setStatus("pending");
      setMessage(null);
      try {
        // Call the verification endpoint which returns { ok: true, user: { ... } }
        const res = await api.get(
          `/auth?action=verifyEmail&token=${encodeURIComponent(token)}`
        );
        if (!mounted) return;
        if (res.data && res.data.ok) {
          setStatus("success");
          setMessage("Email verified! Redirecting to dashboard...");
          // small delay so user sees the message
          setTimeout(() => navigate("/home"), 1500);
          return;
        }
        // fallback
        setStatus("error");
        setMessage(res.data?.error || "Verification failed");
      } catch (err: unknown) {
        setStatus("error");
        type VerifyErrorResponse = { error?: string };

        const serverMsg = isAxiosError<VerifyErrorResponse>(err)
          ? err.response?.data?.error ?? err.message ?? "Verification failed"
          : err instanceof Error
          ? err.message
          : "Verification failed";
        setMessage(serverMsg);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div style={{ maxWidth: 720, margin: "48px auto", padding: 12 }}>
      <h2>Verify your email</h2>

      {status === "idle" && <div>Preparing verification...</div>}

      {status === "pending" && <div>Verifying your email — please wait...</div>}

      {status === "success" && (
        <div style={{ color: "green", marginTop: 12 }}>{message}</div>
      )}

      {status === "error" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "crimson", marginBottom: 12 }}>
            {message || "Verification failed."}
          </div>
          <div>
            <Link to="/login">Go to login</Link>
            {" — "}
            <span>
              If your token expired you can request a new verification email
              from your account page after logging in, or use the resend flow
              (if available).
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
