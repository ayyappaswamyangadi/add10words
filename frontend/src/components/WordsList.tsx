// frontend/src/components/WordsList.tsx

type Word = {
  _id: string;
  word: string;
  addedAt: string | null;
  userId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

export default function WordsList({
  allWords = [],
  myWords = [],
  loading = false,
  currentUserId,
}: {
  allWords?: Word[];
  myWords?: Word[];
  loading?: boolean;
  currentUserId?: string | null;
}) {
  if (loading) return <div style={{ marginTop: 20 }}>Loading...</div>;

  return (
    <div style={{ marginTop: 24, display: "flex", gap: 24 }}>
      {/* My words */}
      <div style={{ flex: 1 }}>
        <h3>
          Your words <small style={{ color: "#666" }}>({myWords.length})</small>
        </h3>
        {myWords.length === 0 ? (
          <div style={{ color: "#666" }}>No words yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Word</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {myWords.map((w) => (
                <tr key={w._id}>
                  <td style={{ padding: "6px 8px" }}>{w.word}</td>
                  <td style={{ padding: "6px 8px", color: "#666" }}>
                    {w.addedAt ? new Date(w.addedAt).toLocaleString() : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* All words */}
      <div style={{ flex: 1 }}>
        <h3>
          All users' words{" "}
          <small style={{ color: "#666" }}>({allWords.length})</small>
        </h3>
        {allWords.length === 0 ? (
          <div style={{ color: "#666" }}>No global words available.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Word</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Owner</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {allWords.map((w) => {
                const isMine =
                  w.userId &&
                  currentUserId &&
                  String(w.userId) === String(currentUserId);
                return (
                  <tr
                    key={w._id}
                    style={{
                      background: isMine ? "rgba(0,128,0,0.04)" : undefined,
                    }}
                  >
                    <td style={{ padding: "6px 8px" }}>{w.word}</td>
                    <td
                      style={{
                        padding: "6px 8px",
                        color: isMine ? "#056608" : "#333",
                      }}
                    >
                      {w.ownerName ?? (isMine ? "You" : w.ownerEmail)}
                    </td>
                    <td style={{ padding: "6px 8px", color: "#666" }}>
                      {w.addedAt ? new Date(w.addedAt).toLocaleString() : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
