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
  
  useEffect(() => {
    invoke<string[]>("get_all_sets").then(setSets);
    invoke<Card[]>("load_cards_with_images").then(setCards);
  }, []);

  const onSetChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const set = e.target.value;
    setSelectedSet(set);

    if(!set){
      invoke<Card[]>("load_cards_with_images").then(setCards);
    } else {
      invoke<Card[]>("get_cards_by_set", { setName: set}).then(setCards);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>YGO Cards</h1>

      <label>Set auswählen:</label>
      <select value={selectedSet} onChange={onSetChange}>
        <option value="">Alle Sets / N/A</option>
        {sets.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

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
