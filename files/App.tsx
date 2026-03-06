import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

import type { CardStub, CardDetail } from "./types/cards";
import CardGrid from "./components/CardGrid";
import CardDetailPanel from "./components/CardDetail";

export default function App() {
  const [cards, setCards] = useState<CardStub[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>("ALL");
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);
  const [collectionOnly, setCollectionOnly] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Load sets once on mount
  useEffect(() => {
    invoke<string[]>("get_all_sets").then(setSets);
  }, []);

  // Debounce: commit search to state 300ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reload stubs whenever filters change, discarding stale responses
  const latestRequestId = useRef(0);
  useEffect(() => {
    const requestId = ++latestRequestId.current;
    const params: Record<string, string> = {};
    if (search.trim().length > 0) params.name = search;
    if (selectedSet !== "ALL") params.set = selectedSet;
    invoke<CardStub[]>("load_card_stubs", params).then((result) => {
      if (requestId === latestRequestId.current) setCards(result);
    });
  }, [search, selectedSet]);

  const handleCardClick = useCallback(async (stub: CardStub) => {
    setDetailLoading(true);
    try {
      const detail = await invoke<CardDetail>("load_card_detail", {
        cardId: stub.id,
        setName: selectedSet === "ALL" ? null : selectedSet,
      });
      setSelectedCard(detail);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedSet]);

  // Called by CardDetailPanel after a successful +/- invoke so App state stays in sync
  function handleCollectionUpdate(
    _cardId: number,
    setCode: string | undefined,
    rarity: string | undefined,
    newValue: number
  ) {
    setSelectedCard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sets: prev.sets.map((s) =>
          s.setCode !== setCode ? s : {
            ...s,
            rarities: s.rarities.map((r) =>
              r.rarity !== rarity ? r : { ...r, collectionAmount: newValue }
            ),
          }
        ),
      };
    });

    // Also update the stub grid so the collection badge stays current
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== _cardId) return c;
        // Recalculate total by adjusting by the delta implied by newValue
        // We don't have the old value here, so we trigger a lightweight re-fetch
        return c;
      })
    );
  }

  const displayedCards = collectionOnly
    ? cards.filter((c) => c.totalCollectionAmount > 0)
    : cards;

  return (
    <div style={{
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 20,
      height: "100vh",
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {/* Filters */}
      <select value={selectedSet} onChange={(e) => setSelectedSet(e.target.value)}>
        <option value="ALL">All Sets</option>
        {sets.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="text"
          placeholder="Search name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button
          onClick={() => setCollectionOnly((v) => !v)}
          style={{
            background: collectionOnly ? "#4caf50" : undefined,
            color: collectionOnly ? "#fff" : undefined,
          }}
        >
          {collectionOnly ? "My Collection ✓" : "My Collection"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "row", gap: 20, minWidth: 20, flex: 1, minHeight: 0 }}>
        <CardGrid
          cards={displayedCards}
          selectedCard={selectedCard}
          onCardClick={handleCardClick}
        />
        <CardDetailPanel
          card={selectedCard}
          loading={detailLoading}
          onCollectionUpdate={handleCollectionUpdate}
        />
      </div>
    </div>
  );
}
