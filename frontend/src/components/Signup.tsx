import React, { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth/useAuth";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();
  const { signup } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      await signup(email, password);
      navigate("/home");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setMsg(error?.response?.data?.error || "Signup failed");
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "40px auto" }}>
      <h2>Sign up</h2>
      {msg && <div style={{ color: "red" }}>{msg}</div>}
      <form onSubmit={submit}>
        <div>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <button type="submit">Sign up</button>
        </div>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
