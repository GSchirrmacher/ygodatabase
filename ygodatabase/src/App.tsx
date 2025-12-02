import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Card {
  id: number;
  name: string;
  card_type: string;
  img_base64?: string;
}

function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  
  // Initial load: immer am Start einmal
  useEffect(() => {
    // Sets laden
    invoke<string[]>("get_all_sets").then(setSets);

    // Default: alle Karten laden
    invoke<Card[]>("load_cards_with_images").then(setCards);
  }, []);

  // Filtering logic (Set & Search)
  useEffect(() => {
  // Falls ein aktiver Suchbegriff existiert → Suche
    if (search.length >= 2) {
      const delay = setTimeout(() => {
      if (selectedSet !== "ALL") {
        invoke("search_cards_by_set_and_name", {
          setName: selectedSet,
          query: search,
        }).then((data: any) => setCards(data));
      } else {
        invoke("search_cards_by_name", { query: search }).then(
          (data: any) => setCards(data)
        );
      }
    }, 400);

    return () => clearTimeout(delay);
  }

  // Falls die Suchleiste leer oder <2 Zeichen → nur Set Filter
  if (selectedSet === "ALL") {
    invoke("load_cards_with_images").then((data: any) => setCards(data));
    } else {
      invoke("get_cards_by_set", { setName: selectedSet }).then(
        (data: any) => setCards(data)
      );
    }
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
            <th>Name</th>
            <th>ID</th>
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
                {c.img_base64 ? (
                  <img
                    src={`data:image/jpeg;base64,${c.img_base64}`}
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
