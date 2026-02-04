import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface Card {
  id: number;
  name: string;
  card_type: string;
  img_base64?: string;
  image_id?: number;
  is_alt_art: boolean;
  set_rarity?: string;
  sets?: string[];
}


export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Load sets + initial cards
  useEffect(() => {
    invoke<string[]>("get_all_sets").then(setSets);
    invoke<Card[]>("load_cards_with_images").then(setCards);
  }, []);

  // Auto-refresh when filters change
  useEffect(() => {
    const params: any = {};

    if (search.trim().length > 0) {
      params.name = search;
    }
    if (selectedSet !== "ALL") {
      params.set = selectedSet;
    }

    invoke<Card[]>("load_cards_with_images", params).then(setCards);
  }, [search, selectedSet]);

  return (
    <div style={{ padding: 24 }}>
      <h1>YGO Cards</h1>

      {/* Filters */}
      <div style={{ marginBottom: 20 }}>
        <select
          value={selectedSet}
          onChange={(e) => setSelectedSet(e.target.value)}
        >
          <option value="ALL">All Sets</option>
          {sets.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <input
          style={{ marginLeft: 10 }}
          type="text"
          placeholder="Search name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <table border={1} cellPadding={5}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Type</th>
            <th>Image</th>
            {selectedSet === "ALL" && <th>Sets</th>}
            {selectedSet !== "ALL" && <th>Rarity</th>}
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={`${c.id}-${c.set_rarity ?? "none"}-${c.image_id ?? "base"}`}>
              <td>{c.id}</td>
              <td>{c.name}</td>
              <td>{c.card_type}</td>
              <td>
                {c.img_base64 ? <img src={`data:image/jpeg;base64,${c.img_base64}`} width={80}/> : "Kein Bild"}
              </td>

              {selectedSet === "ALL" && (
                <td>{c.sets?.join(", ") ?? "-"}</td>
              )}

              {selectedSet !== "ALL" && (
                <td>{c.set_rarity ?? "-"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
