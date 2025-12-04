import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/Core";
import "./App.css";

interface Card {
  id: number;
  name: string;
  card_type: string;
  image_path?: string | null;
};

function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchName, setSearchName] = useState("");
  const [searchSet, setSearchSet] = useState("");
  const [searchType, setSearchType] = useState("");

  // Karten laden, kombiniert nach allen Filtern
  const loadCards = async () => {
    setLoading(true);
    setError(null);

    try {
      const result: Card[] = await invoke("filter_cards", {
        name: searchName.trim() !== "" ? searchName : null,
        setName: searchSet.trim() !== "" ? searchSet : null,
        cardType: searchType.trim() !== "" ? searchType : null,
      });

      setCards(result);
    } catch (e: any) {
      setError("Fehler beim Laden der Karten: " + e);
    }

    setLoading(false);
  };

  // Initial laden (alle Karten)
  useEffect(() => {
    loadCards();
  }, []);

  // Filter anwenden, wenn Enter gedrückt wird
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") loadCards();
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>YGO Card Viewer</h1>

      {/* Filter-Bereich */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
        <input
          type="text"
          placeholder="Nach Name suchen..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          onKeyDown={onEnter}
        />

        <input
          type="text"
          placeholder="Set..."
          value={searchSet}
          onChange={(e) => setSearchSet(e.target.value)}
          onKeyDown={onEnter}
        />

        <input
          type="text"
          placeholder="Kartentyp..."
          value={searchType}
          onChange={(e) => setSearchType(e.target.value)}
          onKeyDown={onEnter}
        />

        <button onClick={loadCards}>Filter anwenden</button>
        <button
          onClick={() => {
            setSearchName("");
            setSearchSet("");
            setSearchType("");
            loadCards();
          }}
        >
          Reset
        </button>
      </div>

      {/* Ladeanzeige */}
      {loading && <p>Lade Karten...</p>}

      {/* Fehleranzeige */}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Wenn keine Ergebnisse */}
      {!loading && cards.length === 0 && <p>Keine Karten gefunden.</p>}

      {/* Kartenanzeige */}
      {!loading && cards.length > 0 && (
        <table border={1} cellPadding={8}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Typ</th>
              <th>Bild</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.name}</td>
                <td>{c.card_type}</td>
                <td>
                  {c.image_path ? (
                    <img
                      src={`data:image/jpeg;base64,${c.image_path}`}
                      width={80}
                    />
                  ) : (
                    "Kein Bild"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default App;