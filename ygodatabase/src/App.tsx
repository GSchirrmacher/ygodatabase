import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/Core";
import "./App.css";

type Card = {
  id: number;
  name: string;
  card_type: string;
  image_path?: string | null;
};

function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const loadSets = async () => {
    try {
      const result = await invoke<string[]>("get_all_sets");
      setSets(result);
    } catch (e) {
      console.error("Fehler beim Laden der Sets:", e);
    }
  };

  const loadCards = async () => {
    try {
      const data = await invoke<Card[]>("filter_cards", {
        query: search.length >= 2 ? search : null,
        set: selectedSet !== "ALL" ? selectedSet : null,
      });
      setCards(data);
    } catch (e) {
      console.error("Fehler beim Laden der Karten:", e);
    }
  };

  useEffect(() => {
    loadSets();
    loadCards();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(loadCards, 250);
    return () => clearTimeout(timeout);
  }, [search, selectedSet]);

  return (
    <div style={{ padding: 20 }}>
      <h1>YGO Cards</h1>

      {/* SET FILTER */}
      <select
        value={selectedSet}
        onChange={(e) => {
          setSelectedSet(e.target.value);
          setSearch("");
        }}
        style={{ padding: 6, marginRight: 12 }}
      >
        <option value="ALL">Alle Sets</option>
        {sets.map((set, i) => (
          <option key={i} value={set}>{set}</option>
        ))}
      </select>

      {/* SUCHFELD */}
      <input
        type="text"
        placeholder="Nach Name suchen…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          padding: 6,
          width: 250,
          marginBottom: 12,
          border: "1px solid gray",
        }}
      />

      <table border={1} cellPadding={5}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Type</th>
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
    </div>
  );
}

export default App;
