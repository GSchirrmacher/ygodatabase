import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { List } from "react-window";
import { useRef } from "react";
import "./App.css";


interface Card {
  id: number;
  name: string;
  card_type: string;
  set_code: string;
  has_alt_art: number;
  image_id?: number;
  set_rarity?: string;
  sets?: string[];
  img_path?: string;
}



export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  function getRarityGroup(rarity?: string): string {
    if (!rarity) return "unknown";
    const normalized = rarity.trim().toLowerCase();
    for (const [group, values] of Object.entries(rarityGroups)) {
      if (
        values.some(
          (value) => value.trim().toLowerCase() === normalized
        )
      ) {
        return group;
      }
    }
    return "unknown";
  }

  const rarityGroups: Record<string, string[]> = {
    collectors_rare: [
      "Collector's Rare",
      "Cr",
    ],
    common: [
      "Common",
      "Short Print",
      "Duel Terminal Normal Parallel Rare",
      "Duel Terminal Normal Rare Parallel Rare",
    ],
    extra_secret_rare: [
      "Extra Secret",
      "Extra Secret Rare"
    ],
    ghost_rare: [
      "Ghost Rare",
      "Ghost/Gold Rare",
    ],
    gold_rare: [
      "Gold Rare",
    ],
    gold_secret_rare: [
      "Gold Secret Rare",
    ],
    mosaic_rare: [
      "Mosaic Rare",
    ],
    parallel_rare: [
      "Normal Parallel Rare",   
    ],
    platinum_rare: [
      "Platinum Rare",
    ],
    platinum_secret_rare: [
      "Platinum Secret Rare",
    ],
    premium_gold_rare: [
      "Premium Gold Rare",
    ],
    quarter_century_secret_rare: [
      "Quarter Century Secret Rare",
    ],
    rare: [
      "Rare",
      "Duel Terminal Rare Parallel Rare",
    ],
    secret_parallel_rare: [
      "Secret Parallel Rare"
    ],
    secret_rare: [
      "Secret Rare",
      "Prismatic Secret Rare",
    ],
    shatterfoil:[
      "Shatterfoil Rare",
    ],
    special: [
      "10000 Secret Rare",
      "Ultra Secret Rare",
    ],
    starfoil: [
      "Starfoil",
      "Starfoil Rare"
    ],
    starlight_rare: [
      "Starlight Rare",
    ],
    super_parallel_rare: [
      "Super Parallel Rare",
    ],
    super_rare: [
      "Super Rare",
      "Super Short Print",
      "Duel Terminal Super Parallel Rare",
    ],
    ultimate_rare:[
      "Ultimate Rare",
    ],
    ultra_parallel_rare: [
      "Ultra Parallel Rare",  
      "Ultra Rare (Pharaoh's Rare)",
    ],
    ultra_rare: [
      "Ultra Rare",
      "Duel Terminal Ultra Parallel Rare",
    ],
    unknown: [
      "New",
      "2",
      "3",
      "European debut",
      "European & Oceanian debut",
      "Oceanian debut",
      "Reprint",
      "New artwork",
    ]
  };

  const rarityGroupColors: Record<string, string> = {
    collectors_rare: "",
    common: "#030303",
    extra_secret_rare: "#ff00dd",
    ghost_rare: "#ffffff",
    gold_rare: "#ddb812",
    gold_secret_rare: "#ddb812",
    mosaic_rare: "#4cd64c",
    parallel_rare: "#f1c40f",
    platinum_rare: "#777777",
    platinum_secret_rare: "#9b59b6",
    premium_gold_rare: "#ddb812",
    quarter_century_secret_rare: "#e74c3c",
    rare: "#363636",
    secret_parallel_rare: "#9b59b6",
    secret_rare: "#9b59b6",
    shatterfoil: "#4cd64c",
    special: "#4cd64c",
    starfoil: "#4cd64c",
    starlight_rare: "#ff00dd",
    super_parallel_rare: "#f1ff6f",
    super_rare: "#f1ff6f",
    ultimate_rare: "#3801ff",
    ultra_parallel_rare: "#6194e0",
    ultra_rare: "#6194e0",
    unknown: "#030303",
  };


  const rarityGroupIcons: Record<string, string> = {
    collectors_rare: "/rarities/collectors_rare.png",
    common: "/rarities/common.png",
    extra_secret_rare: "/rarities/extra_secret_rare.png",
    ghost_rare: "/rarities/ghost_rare.png",
    gold_rare: "/rarities/gold_rare.png",
    gold_secret_rare: "/rarities/gold_secret_rare.png",
    mosaic_rare: "/rarities/mosaic_rare.png",
    parallel_rare: "/rarities/parallel_rare.png",
    platinum_rare: "/rarities/platinum_rare.png",
    platinum_secret_rare: "/rarities/platinum_secret_rare.png",
    premium_gold_rare: "/rarities/premium_gold_rare.png",
    quarter_century_secret_rare: "/rarities/quarter_century_secret_rare.png",
    rare: "/rarities/rare.png",
    secret_parallel_rare: "/rarities/secret_parallel_rare.png",
    secret_rare: "/rarities/secret_rare.png",
    shatterfoil: "/rarities/shatterfoil.png",
    special: "/rarities/special.png",
    starfoil: "/rarities/starfoil.png",
    starlight_rare: "/rarities/starlight_rare.png",
    super_parallel_rare: "/rarities/super_parallel_rare.png",
    super_rare: "/rarities/super_rare.png",
    ultimate_rare: "/rarities/ultimate_rare.png",
    ultra_parallel_rare: "/rarities/ultra_parallel_rare.png",
    ultra_rare: "/rarities/ultra_rare.png",
    unknown: "/rarities/token.png",  
  };

  const groupedCards = Object.values(
    cards.reduce((acc, card) => {
      const key=`${card.id}-${card.image_id ?? "base"}-${card.set_code ?? "none"}`;

      if (!acc[key]) {
        acc[key] = {
          ...card,
          rarities: card.set_rarity ? [card.set_rarity] : [],
        };
      } else if (card.set_rarity) {
        acc[key].rarities.push(card.set_rarity);
      }

      return acc;
    }, {} as Record<string, Card & { rarities: string[] }>)
  );
  
  // Load sets + initial cards
  useEffect(() => {
    invoke<string[]>("get_all_sets").then(setSets);
    invoke<Card[]>("load_cards_with_images").then(setCards);
  }, []);

  // Auto-refresh when filters change
  useEffect(() => {
    const params: any = {};
    if (search.trim().length > 0) params.name = search;
    if (selectedSet !== "ALL") params.set = selectedSet;
    invoke<Card[]>("load_cards_with_images", params).then(setCards);
  }, [search, selectedSet]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setGridWidth(entries[0].contentRect.width);
      }
    });

    if (gridRef.current) {
      observer.observe(gridRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Filters */}
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

      <div style={{ display: "flex", flexDirection: "row", gap: 20, minWidth: 20 }}>
        
        {/* LEFT: CARD GRID */}
        <div
          ref={gridRef}
          style={{ flex: 3, minWidth: 0, height: "calc(100vh - 180px)", overflow: "hidden" }}
        >
          {gridWidth > 0 && (() => {
            const CARD_WIDTH = 140;
            const CARD_HEIGHT = 200;
            const columnCount = Math.max(1, Math.floor(gridWidth / CARD_WIDTH));
            const rowCount = Math.ceil(groupedCards.length / columnCount);

            return (
              <List
                style={{ height: "100%", width: gridWidth }}
                rowCount={rowCount}
                rowHeight={CARD_HEIGHT}
                rowProps={{}}
                rowComponent={({ index, style }) => {
                  const start = index * columnCount;
                  const rowCards = groupedCards.slice(start, start + columnCount);

                  return (
                    <div
                      style={{
                        ...style,
                        display: "flex",
                        gap: 10,
                        padding: 5,
                      }}
                    >
                      {rowCards.map((c) => {
                        const group = getRarityGroup(c.set_rarity);
                        const rarityColor =
                          selectedCard?.id === c.id
                            ? "#4caf50"
                            : group
                            ? rarityGroupColors[group]
                            : "#ccc";

                        return (
                          <div
                            key={`${c.id}-${c.set_rarity ?? "none"}-${c.image_id ?? "base"}-${c.set_code ?? "none"}`}
                            style={{
                              position: "relative",
                              cursor: "pointer",
                              border: `2px solid ${rarityColor}`,
                              borderRadius: 8,
                              transition: "all 0.15s ease",
                            }}
                            onClick={() => setSelectedCard(c)}
                          >
                            <img
                              src={c.img_path?.replace("asset://", "/")}
                              width={120}
                              style={{
                                display: "block",
                                borderRadius: 6,
                              }}
                            />

                            {/* RARITY ICON OVERLAY */}
                            {c.rarities && c.rarities.length > 0 && (() => {
                              const primaryGroup = getRarityGroup(c.rarities[0]);
                              const primaryIcon = rarityGroupIcons[primaryGroup];

                              const additionalCount = c.rarities.length - 1;

                              return (
                                <>
                                  {/* Primary Icon */}
                                  {primaryIcon && (
                                    <img
                                      src={primaryIcon}
                                      width={24}
                                      style={{
                                        position: "absolute",
                                        bottom: 6,
                                        right: 36,
                                        background: "rgba(0,0,0,0.6)",
                                        padding: 3,
                                        borderRadius: 6,
                                      }}
                                    />
                                  )}

                                  {/* Secondary Icon OR +x */}
                                  {additionalCount === 1 && (() => {
                                    const secondGroup = getRarityGroup(c.rarities[1]);
                                    const secondIcon = rarityGroupIcons[secondGroup];

                                    return secondIcon ? (
                                      <img
                                        src={secondIcon}
                                        width={24}
                                        style={{
                                          position: "absolute",
                                          bottom: 6,
                                          right: 6,
                                          background: "rgba(0,0,0,0.6)",
                                          padding: 3,
                                          borderRadius: 6,
                                        }}
                                      />
                                    ) : null;
                                  })()}

                                  {additionalCount > 1 && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        bottom: 6,
                                        right: 6,
                                        background: "rgba(0,0,0,0.75)",
                                        color: "white",
                                        fontSize: 12,
                                        padding: "2px 6px",
                                        borderRadius: 6,
                                      }}
                                    >
                                      +{additionalCount}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
            );
          })()}
        </div>

        {/* RIGHT: CARD DETAILS */}
        <div
          style={{
            flex: 2,
            minWidth: 0,
            padding: 20,
            border: "1px solid #ccc",
            borderRadius: 8,
            minHeight: 600,
            overflow: "auto",
          }}
       >
         {!selectedCard && <p>Select a card</p>}

          {selectedCard && (() => {
            const group = getRarityGroup(selectedCard.set_rarity);
            const rarityIcon = group ? rarityGroupIcons[group] : undefined;

            return (
              <>
                <h2>{selectedCard.name}</h2>

                <img
                  src={selectedCard.img_path?.replace("asset://img/", "/img_cropped/")}
                  width={250}
                  style={{ marginBottom: 15 }}
                />

                <p><strong>ID:</strong> {selectedCard.id}</p>
                <p><strong>Type:</strong> {selectedCard.card_type}</p>
                <p><strong></strong></p>

                {selectedCard.set_rarity && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong>Rarity:</strong>
                    <span>{selectedCard.set_rarity}</span>
                    {rarityIcon && (
                      <img
                        src={rarityIcon}
                        width={28}
                      />
                    )}
                  </div>
                )}

                {selectedSet === "ALL" && (
                  <p>
                    <strong>Sets:</strong>{" "}
                    {selectedCard.sets?.join(", ") ?? "-"}
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}