import React, { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/useAuth";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const { signup } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    try {
      // signup() will call POST /api/auth?action=signup
      // API now returns { ok: true, message: "...verify your email" }
      const res = await signup(name, email, password);

      setMsg(
        res?.message ||
          "Signup successful! Please check your email to verify your account."
      );

      // Clear fields
      setName("");
      setEmail("");
      setPassword("");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setMsg(error?.response?.data?.error || "Signup failed");
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "40px auto" }}>
      <h2>Sign up</h2>

      {msg && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 6,
            background: msg.toLowerCase().includes("success")
              ? "#e8fbe8"
              : "#ffecec",
            color: msg.toLowerCase().includes("success")
              ? "#0a7a0a"
              : "#b20000",
          }}
        >
          {msg}
        </div>
      )}

      <form onSubmit={submit}>
        <div style={{ marginBottom: 10 }}>
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </div>

        <button type="submit" style={{ padding: "8px 14px" }}>
          Sign up
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
