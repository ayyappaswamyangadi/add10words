// frontend/src/components/AddWords.tsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";

type Conflicts = { db: string[]; inBatch: string[] } | null;

type ApiError = {
  response?: {
    status?: number;
    data?: {
      error?: string;
      conflicts?: Conflicts;
    };
  };
};

const isApiError = (err: unknown): err is ApiError =>
  typeof err === "object" &&
  err !== null &&
  Object.prototype.hasOwnProperty.call(err, "response") &&
  typeof (err as { response?: unknown }).response === "object";

function normalize(word: string) {
  return word.trim();
}

type AddWordsProps = {
  onAdded?: () => void | Promise<void>;
};

export default function AddWords({ onAdded }: AddWordsProps = {}) {
  const { api } = useAuth();
  const [text, setText] = useState<string>(""); // raw input
  const [conflicts, setConflicts] = useState<Conflicts>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // All saved words for this user (fetched from backend) — used for display only
  const [savedWords, setSavedWords] = useState<
    Array<{ word: string; wordLower: string }>
  >([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);

  // parse words from raw text into array of trimmed strings
  const parsed = useMemo(() => {
    return text
      .split(/[\n,;]+/)
      .map(normalize)
      .filter(Boolean)
      .slice(0, 100); // defensive
  }, [text]);

  // mapping from lower -> list of original occurrences (for display)
  const occurrenceMap = useMemo(() => {
    const map = new Map<string, string[]>();
    parsed.forEach((w) => {
      const k = w.toLowerCase();
      const list = map.get(k) ?? [];
      list.push(w);
      map.set(k, list);
    });
    return map;
  }, [parsed]);

  const parsedCount = parsed.length;

  // check in-batch duplicates client-side (efficient)
  const inBatchDupKeys = useMemo(() => {
    const counts = new Map<string, number>();
    parsed.forEach((w) => {
      const k = w.toLowerCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([k]) => k);
  }, [parsed]);

  // Build final words after applying replacements (used for validation before submit)
  const buildFinal = () => {
    return parsed.map((w) => {
      const key = w.toLowerCase();
      const has = Object.prototype.hasOwnProperty.call(replacements, key);
      const rep = has ? replacements[key] : undefined;
      if (has && rep !== undefined && rep !== null && rep.trim() !== "") {
        return rep.trim();
      }
      return w.trim();
    });
  };

  // Validate whether final set is valid: 10 unique non-empty words
  const isFinalValid = () => {
    const final = buildFinal();
    if (final.length !== 10) return false;
    if (final.some((f) => !f)) return false;
    const lowers = final.map((f) => f.toLowerCase());
    return new Set(lowers).size === 10;
  };

  // fetch saved words for the current user (for display)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSavedLoading(true);
      setSavedError(null);
      try {
        const res = await api.get("/words");
        const docs: any[] = res.data ?? [];
        if (cancelled) return;
        const arr = docs.map((d) => ({
          word: String(d.word || "").trim(),
          wordLower: String(
            d.wordLower || String(d.word || "").toLowerCase()
          ).toLowerCase(),
        }));
        setSavedWords(arr);
      } catch {
        if (!cancelled) {
          setSavedError("Failed to load saved words");
          setSavedWords([]);
        }
      } finally {
        if (!cancelled) setSavedLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  // helper to initialize replacement map from list of lowercase keys
  const initReplacementsFromList = (keys: string[]) => {
    const map: Record<string, string> = {};
    keys.forEach((k) => (map[k.toLowerCase()] = ""));
    return map;
  };

  // Handler: ask backend to validate (global DB check).
  // We still show in-batch duplicates immediately without calling the server.
  const handleValidate = async () => {
    setMessage(null);
    setConflicts(null);

    if (parsedCount !== 10) {
      setMessage(`Please enter exactly 10 words. You entered ${parsedCount}.`);
      return;
    }

    if (inBatchDupKeys.length > 0) {
      const inBatchLower = inBatchDupKeys.map((k) => k.toLowerCase());
      setConflicts({ db: [], inBatch: inBatchLower });
      setReplacements(initReplacementsFromList(inBatchLower));
      setMessage("Please replace the duplicate words shown below.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/words?action=validate", { words: parsed });
      // backend returns shape: { ok: true/false, conflicts: { db:[], inBatch:[] } }
      const c: Conflicts = res.data?.conflicts ?? { db: [], inBatch: [] };
      if ((c && c.db && c.db.length) || (c && c.inBatch && c.inBatch.length)) {
        const map: Record<string, string> = {};
        [...(c.db || []), ...(c.inBatch || [])].forEach((k) => (map[k] = ""));
        setReplacements(map);
        setConflicts(c);
        setMessage("Some words are duplicates — please replace them.");
      } else {
        // no conflicts, submit directly (use buildFinal to ensure trimmed)
        await submitFinal(buildFinal());
      }
    } catch (err: unknown) {
      const fallback = "Validation failed";
      if (isApiError(err)) {
        setMessage(err.response?.data?.error || fallback);
      } else {
        setMessage(fallback);
      }
    } finally {
      setLoading(false);
    }
  };

  // submit final words to backend (action=submit)
  const submitFinal = async (finalWords: string[]) => {
    setLoading(true);
    setMessage(null);
    try {
      await api.post("/words?action=submit", { words: finalWords });
      setMessage("Words added successfully!");
      setText("");
      setConflicts(null);
      setReplacements({});
      // Call onAdded callback if provided
      if (onAdded) {
        await onAdded();
      }
      // refresh saved words list (for display)
      try {
        const res = await api.get("/words");
        const docs: any[] = res.data ?? [];
        const arr = docs.map((d) => ({
          word: String(d.word || "").trim(),
          wordLower: String(
            d.wordLower || String(d.word || "").toLowerCase()
          ).toLowerCase(),
        }));
        setSavedWords(arr);
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      // if server reports conflicts (race), show them
      if (
        isApiError(err) &&
        err.response?.status === 409 &&
        err.response?.data?.conflicts
      ) {
        setConflicts(err.response.data.conflicts);
        const map: Record<string, string> = {};
        [
          ...(err.response.data.conflicts.db || []),
          ...(err.response.data.conflicts.inBatch || []),
        ].forEach((k: string) => (map[k] = ""));
        setReplacements(map);
        setMessage(
          "Conflicts detected on submit — please replace highlighted words."
        );
      } else {
        const fallback = "Submit failed";
        if (isApiError(err)) {
          setMessage(err.response?.data?.error || fallback);
        } else {
          setMessage(fallback);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // When user clicks "Submit replacements" after editing replacement inputs
  const handleSubmitReplacements = async () => {
    if (!isFinalValid()) {
      setMessage("Final list must be exactly 10 unique non-empty words.");
      return;
    }
    const final = buildFinal();
    await submitFinal(final);
  };

  // helper: highlight DB duplicates from current user's saved list (display convenience)
  const savedLowerSet = useMemo(
    () => new Set(savedWords.map((s) => s.wordLower)),
    [savedWords]
  );
  const isDbDuplicate = (wordLower: string) =>
    savedLowerSet.has(wordLower) || conflicts?.db?.includes(wordLower);
  const isInBatchDuplicate = (wordLower: string) =>
    inBatchDupKeys.includes(wordLower) ||
    conflicts?.inBatch?.includes(wordLower);

  return (
    <div style={{ maxWidth: 900, margin: "12px auto", padding: 12 }}>
      <h3>Add exactly 10 words</h3>

      <textarea
        aria-label="words-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter exactly 10 words separated by comma/newline/semicolon"
        rows={5}
        style={{ width: "100%", padding: 10, fontSize: 14 }}
      />

      <div
        style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}
      >
        <button
          onClick={handleValidate}
          disabled={loading || parsedCount !== 10}
          aria-disabled={loading || parsedCount !== 10}
        >
          Validate & Submit
        </button>

        <button
          onClick={() => {
            setText("");
            setConflicts(null);
            setReplacements({});
            setMessage(null);
          }}
          disabled={loading}
        >
          Clear
        </button>

        <div style={{ marginLeft: "auto", color: "#555" }}>
          Words: {parsedCount} / 10
        </div>
      </div>

      {message && (
        <div
          style={{
            marginTop: 10,
            color: message.toLowerCase().includes("success")
              ? "green"
              : "crimson",
          }}
        >
          {message}
        </div>
      )}

      {/* Parsed words visual */}
      {parsedCount > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: "#333", marginBottom: 8 }}>
            Parsed words (visual):
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Array.from(occurrenceMap.entries()).map(([lower, originals]) => {
              const dbDup = isDbDuplicate(lower);
              const batchDup = isInBatchDuplicate(lower);
              return (
                <div
                  key={lower}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    background: dbDup
                      ? "#ffecec"
                      : batchDup
                      ? "#fff7cc"
                      : "#f7f7f7",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 120,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{originals.join(", ")}</div>
                  <div style={{ marginLeft: "auto", fontSize: 12 }}>
                    {dbDup && (
                      <span style={{ color: "#b22222", fontWeight: 700 }}>
                        DB
                      </span>
                    )}
                    {batchDup && (
                      <span
                        style={{
                          color: "#b8860b",
                          marginLeft: 6,
                          fontWeight: 600,
                        }}
                      >
                        Batch
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Saved words table (current user only) */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: "#333", marginBottom: 8 }}>
          Your saved words:
        </div>
        <div
          style={{
            border: "1px solid #e6e6e6",
            padding: 8,
            borderRadius: 6,
            maxHeight: 240,
            overflow: "auto",
            background: "#fafafa",
          }}
        >
          {savedLoading ? (
            <div style={{ padding: 10 }}>Loading...</div>
          ) : savedError ? (
            <div style={{ padding: 10, color: "crimson" }}>{savedError}</div>
          ) : savedWords.length === 0 ? (
            <div style={{ padding: 10, color: "#666" }}>
              No saved words yet.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Word
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Lowercase
                  </th>
                </tr>
              </thead>
              <tbody>
                {savedWords.map((s) => (
                  <tr key={s.wordLower}>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid #f4f4f4",
                      }}
                    >
                      {s.word}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid #f4f4f4",
                        color: "#666",
                      }}
                    >
                      {s.wordLower}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Conflicts editor */}
      {conflicts && (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #f0ad4e",
            padding: 12,
            borderRadius: 8,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Conflicting words — please replace
          </div>

          {/* DB conflicts */}
          {conflicts.db?.length ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "#333", marginBottom: 6 }}>
                Conflicts with existing words in the app:
              </div>
              {conflicts.db.map((key) => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "#444" }}>
                    {occurrenceMap.get(key)?.join(", ") ?? key}{" "}
                    <span style={{ color: "#b22222" }}>(already exists)</span>
                  </div>
                  <input
                    aria-label={`replacement-${key}`}
                    placeholder="Replacement (required)"
                    value={replacements[key] ?? ""}
                    onChange={(e) =>
                      setReplacements((p) => ({ ...p, [key]: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: 8,
                      marginTop: 6,
                      border:
                        (replacements[key] ?? "").trim() === ""
                          ? "1px solid #e57373"
                          : "1px solid #ddd",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {/* In-batch duplicates */}
          {conflicts.inBatch?.length ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "#333", marginBottom: 6 }}>
                Duplicates inside your list:
              </div>
              {conflicts.inBatch.map((key) => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "#444" }}>
                    {occurrenceMap.get(key)?.join(", ") ?? key}{" "}
                    <span style={{ color: "#b8860b" }}>(duplicate)</span>
                  </div>
                  <input
                    aria-label={`replacement-batch-${key}`}
                    placeholder="Replacement (required)"
                    value={replacements[key] ?? ""}
                    onChange={(e) =>
                      setReplacements((p) => ({ ...p, [key]: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: 8,
                      marginTop: 6,
                      border:
                        (replacements[key] ?? "").trim() === ""
                          ? "1px solid #e57373"
                          : "1px solid #ddd",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={handleSubmitReplacements}
              disabled={!isFinalValid() || loading}
            >
              Submit replacements
            </button>
            <button
              onClick={() => {
                setConflicts(null);
                setReplacements({});
                setMessage(null);
              }}
            >
              Cancel
            </button>
            <div
              style={{ marginLeft: "auto", color: "#666", alignSelf: "center" }}
            >
              Final list must be 10 unique words.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
