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
  
 useEffect(() => {
    invoke<Card[]>("load_cards_with_images").then(setCards);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>YGO Cards</h1>

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
