import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Card {
  id: number;
  name: string;
  card_type: string;
}

function App() {
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    invoke<Card[]>("get_first_cards").then(setCards).catch(console.error);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>YGO Cards</h1>

      <table border={1} cellPadding={5}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>{c.name}</td>
              <td>{c.card_type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
