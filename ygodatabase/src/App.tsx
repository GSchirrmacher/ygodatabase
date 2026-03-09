import { useState } from "react";
import "./App.css";

import MainMenu from "./components/MainMenu";
import CollectionManager from "./components/CollectionManager";
import Deckbuilder from "./components/Deckbuilder";

type Screen = "menu" | "collection" | "deckbuilder";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");

  return (
    <>
      {screen === "menu" && (
        <MainMenu onNavigate={(s) => setScreen(s)} />
      )}
      {screen === "collection" && (
        <CollectionManager onBack={() => setScreen("menu")} />
      )}
      {screen === "deckbuilder" && (
        <Deckbuilder onBack={() => setScreen("menu")} />
      )}
    </>
  );
}
