// frontend/src/components/AddWords.tsx
import { useMemo, useState } from "react";
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
  "response" in err &&
  typeof (err as { response?: unknown }).response === "object";

function normalize(word: string) {
  return word.trim();
}

export default function AddWords() {
  const { api } = useAuth();
  const [text, setText] = useState<string>(""); // raw input
  const [conflicts, setConflicts] = useState<Conflicts>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // parse words from raw text into array of trimmed strings
  const parsed = useMemo(() => {
    return text
      .split(/[\n,;]+/)
      .map(normalize)
      .filter(Boolean)
      .slice(0, 100); // defensive
  }, [text]);

  // helper: mapping from lower -> list of original occurrences (for display)
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

  // UI state helpers
  const parsedCount = parsed.length;

  // check in-batch duplicates client-side
  const inBatchDupKeys = useMemo(() => {
    const lowers = parsed.map((w) => w.toLowerCase());
    return Array.from(
      new Set(lowers.filter((v, i) => lowers.indexOf(v) !== i))
    );
  }, [parsed]);

  // Build a set of conflict keys for quick checks
  // const conflictSet = useMemo(() => {
  //   if (!conflicts) return new Set<string>(inBatchDupKeys);
  //   return new Set<string>([
  //     ...conflicts.db,
  //     ...conflicts.inBatch,
  //     ...inBatchDupKeys,
  //   ]);
  // }, [conflicts, inBatchDupKeys]);

  // Build final words after applying replacements (used for validation before submit)
  const buildFinal = () => {
    // Replace any word whose lower-case exists in replacements map
    return parsed.map((w) => {
      const key = w.toLowerCase();
      if (replacements[key] !== undefined && replacements[key] !== null) {
        return replacements[key].trim();
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

  // Visual helpers for showing which words are duplicates
  const isDbDuplicate = (wordLower: string) =>
    conflicts?.db?.includes(wordLower);
  const isInBatchDuplicate = (wordLower: string) =>
    inBatchDupKeys.includes(wordLower) ||
    conflicts?.inBatch?.includes(wordLower);

  // Handler: ask backend to validate (checking DB duplicates)
  const handleValidate = async () => {
    setMessage(null);
    setConflicts(null);

    if (parsedCount !== 10) {
      setMessage(`Please enter exactly 10 words. You entered ${parsedCount}.`);
      return;
    }

    if (inBatchDupKeys.length > 0) {
      // preflight: show in-batch duplicates immediately
      setConflicts({ db: [], inBatch: inBatchDupKeys });
      // initialize replacements for keys
      const map: Record<string, string> = {};
      inBatchDupKeys.forEach((k) => (map[k] = ""));
      setReplacements(map);
      setMessage("Please replace the duplicate words shown below.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/words?action=validate", { words: parsed });
      const c: Conflicts = res.data?.conflicts ?? { db: [], inBatch: [] };
      if ((c && c.db && c.db.length) || (c && c.inBatch && c.inBatch.length)) {
        // initialize replacements for all conflict keys (db + inBatch)
        const map: Record<string, string> = {};
        [...(c.db || []), ...(c.inBatch || [])].forEach((k) => (map[k] = ""));
        setReplacements(map);
        setConflicts(c);
        setMessage("Some words are duplicates — please replace them.");
      } else {
        // no conflicts, submit directly
        await submitFinal(parsed);
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

  return (
    <div style={{ maxWidth: 800, margin: "12px auto", padding: 12 }}>
      <h3>Add exactly 10 words</h3>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter exactly 10 words separated by comma/newline/semicolon"
        rows={5}
        style={{ width: "100%", padding: 10, fontSize: 14 }}
      />

      <div
        style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}
      >
        <button onClick={handleValidate} disabled={loading}>
          Validate & Submit
        </button>

        <button
          onClick={() => {
            setText("");
            setConflicts(null);
            setReplacements({});
            setMessage(null);
          }}
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
            color: message.includes("success") ? "green" : "crimson",
          }}
        >
          {message}
        </div>
      )}

      {/* Display parsed words with duplicate highlighting */}
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

      {/* If conflicts exist, show editor for each conflicting key */}
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

          {/* Show DB conflicts first */}
          {conflicts.db?.length ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "#333", marginBottom: 6 }}>
                Existing in your saved words:
              </div>
              {conflicts.db.map((key) => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "#444" }}>
                    {occurrenceMap.get(key)?.join(", ") ?? key}{" "}
                    <span style={{ color: "#b22222" }}>(already saved)</span>
                  </div>
                  <input
                    placeholder="Replacement (required)"
                    value={replacements[key] ?? ""}
                    onChange={(e) =>
                      setReplacements((p) => ({ ...p, [key]: e.target.value }))
                    }
                    style={{ width: "100%", padding: 8, marginTop: 6 }}
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
                    placeholder="Replacement (required)"
                    value={replacements[key] ?? ""}
                    onChange={(e) =>
                      setReplacements((p) => ({ ...p, [key]: e.target.value }))
                    }
                    style={{ width: "100%", padding: 8, marginTop: 6 }}
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
