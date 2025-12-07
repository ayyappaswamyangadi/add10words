import React from "react";

type Word = { _id: string; word: string; addedAt: string };

export default function WordsList({
  words,
  loading,
}: {
  words: Word[];
  loading: boolean;
}) {
  if (loading) return <div>Loading...</div>;
  if (!words || !words.length) return <div>No words</div>;
  return (
    <div style={{ marginTop: 12 }}>
      {words.map((w) => (
        <div
          key={w._id}
          style={{
            padding: 8,
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>{w.word}</div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {new Date(w.addedAt).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
