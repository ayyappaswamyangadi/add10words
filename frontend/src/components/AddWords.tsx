import { useState } from "react";
import { useAuth } from "../auth/useAuth";

export default function AddWords({ onAdded }: { onAdded?: () => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const { api } = useAuth();

  const submit = async () => {
    setMsg("");
    const parsed = text
      .split(/\r?\n|,|;/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length === 0) {
      setMsg("Enter 1–10 words");
      return;
    }
    try {
      const res = await api.post("/words", { words: parsed });
      setText("");
      setMsg(`Added ${res.data.added || parsed.length} word(s)`);
      onAdded?.();
    } catch (e: unknown) {
      const error = e as { response?: { data?: { error?: string } } };
      setMsg(error?.response?.data?.error || "Add failed");
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid #ddd",
        padding: 12,
        borderRadius: 8,
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{ width: "100%" }}
        placeholder="apple, banana, cat"
      ></textarea>
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button onClick={submit}>Add words</button>
        <div style={{ color: "red" }}>{msg}</div>
      </div>
    </div>
  );
}
