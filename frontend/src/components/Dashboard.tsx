// frontend/src/components/Dashboard.tsx
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import AddWords from "./AddWords";
import WordsList from "./WordsList";

type Word = {
  _id: string;
  word: string;
  addedAt: string;
  userId?: string | null;
};

export default function Dashboard(): JSX.Element {
  const { api, logout, user } = useAuth();
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [myWords, setMyWords] = useState<Word[]>([]);
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
      // Expect backend GET /words to return either Array<Word> OR { all: Word[], mine: Word[] }
      const res = await api.get("/words", { params: filters });
      const data = res.data;
      if (Array.isArray(data)) {
        // backward compatibility: older server returned only user's list
        setMyWords(data as Word[]);
        setAllWords([]);
      } else {
        setAllWords((data?.all || []) as Word[]);
        setMyWords((data?.mine || []) as Word[]);
      }
    } catch (err) {
      console.error("Failed to load words:", err);
      setAllWords([]);
      setMyWords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filters]);

  const exportCsv = () => {
    // Exports the user's words (myWords) as CSV: word,addedAt
    const rows = [
      ["word", "addedAt"],
      ...myWords.map((w) => [w.word, new Date(w.addedAt).toLocaleString()]),
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
  };

  return (
    <div style={{ maxWidth: 1000, margin: "24px auto", padding: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Your words</h2>
        <div>
          <span style={{ marginRight: 12 }}>
            Signed in as {user?.name ?? user?.email}
          </span>
          <button onClick={logout}>Logout</button>
        </div>
      </div>

      <AddWords onAdded={() => load()} />

      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <label>
          Sort:
          <select
            value={filters.sort}
            onChange={(e) =>
              setFilters((s) => ({ ...s, sort: e.target.value }))
            }
            style={{ marginLeft: 8 }}
          >
            <option value="date-desc">Newest</option>
            <option value="date-asc">Oldest</option>
            <option value="alpha-asc">A → Z</option>
            <option value="alpha-desc">Z → A</option>
          </select>
        </label>

        <label>
          From:
          <input
            type="date"
            value={filters.from}
            onChange={(e) =>
              setFilters((s) => ({ ...s, from: e.target.value }))
            }
            style={{ marginLeft: 8 }}
          />
        </label>

        <label>
          To:
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((s) => ({ ...s, to: e.target.value }))}
            style={{ marginLeft: 8 }}
          />
        </label>

        <label style={{ flex: "1 0 220px" }}>
          Search:
          <input
            value={filters.q}
            onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))}
            placeholder="search words"
            style={{ marginLeft: 8, width: "100%" }}
          />
        </label>

        <button onClick={() => load()}>Apply</button>
        <button
          onClick={() =>
            setFilters({ sort: "date-desc", from: "", to: "", q: "" })
          }
        >
          Reset
        </button>

        <button onClick={exportCsv} style={{ marginLeft: "auto" }}>
          Export CSV
        </button>
      </div>

      <WordsList
        allWords={allWords}
        myWords={myWords}
        loading={loading}
        currentUserId={user?.id}
      />
    </div>
  );
}
