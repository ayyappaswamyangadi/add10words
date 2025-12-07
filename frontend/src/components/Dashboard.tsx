import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import AddWords from "./AddWords";
import WordsList from "./WordsList";

type Word = { _id: string; word: string; addedAt: string };

export default function Dashboard() {
  const { api, logout, user } = useAuth();
  const [words, setWords] = useState<Word[]>([]);
  const [filters, setFilters] = useState({
    sort: "date-desc",
    from: "",
    to: "",
    q: "",
  });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<Word[]>("/words", { params: filters });
      setWords(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user, filters]);

  return (
    <div style={{ maxWidth: 1000, margin: "24px auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Your words</h2>
        <div>
          <span style={{ marginRight: 12 }}>Signed in as {user?.email}</span>
          <button onClick={logout}>Logout</button>
        </div>
      </div>

      <AddWords onAdded={() => load()} />

      <div style={{ marginTop: 12 }}>
        <label>
          Sort:
          <select
            value={filters.sort}
            onChange={(e) =>
              setFilters((s) => ({ ...s, sort: e.target.value }))
            }
          >
            <option value="date-desc">Newest</option>
            <option value="date-asc">Oldest</option>
            <option value="alpha-asc">A → Z</option>
            <option value="alpha-desc">Z → A</option>
          </select>
        </label>
        <label style={{ marginLeft: 8 }}>
          From:{" "}
          <input
            type="date"
            value={filters.from}
            onChange={(e) =>
              setFilters((s) => ({ ...s, from: e.target.value }))
            }
          />
        </label>
        <label style={{ marginLeft: 8 }}>
          To:{" "}
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((s) => ({ ...s, to: e.target.value }))}
          />
        </label>
        <label style={{ marginLeft: 8 }}>
          Search:{" "}
          <input
            value={filters.q}
            onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))}
          />
        </label>
        <button style={{ marginLeft: 8 }} onClick={() => load()}>
          Apply
        </button>
        <button
          style={{ marginLeft: 8 }}
          onClick={() => {
            setFilters({ sort: "date-desc", from: "", to: "", q: "" });
          }}
        >
          Reset
        </button>
        <button
          style={{ marginLeft: 12 }}
          onClick={() => {
            const rows = [
              ["word", "addedAt"],
              ...words.map((w) => [
                w.word,
                new Date(w.addedAt).toLocaleString(),
              ]),
            ];
            const csv = rows
              .map((r) =>
                r
                  .map((cell) =>
                    String(cell).includes(",")
                      ? `"${String(cell).replace(/"/g, '""')}"`
                      : cell
                  )
                  .join(",")
              )
              .join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `daily10-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export CSV
        </button>
      </div>

      <WordsList words={words} loading={loading} />
    </div>
  );
}
