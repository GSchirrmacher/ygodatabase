import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { List } from "react-window";
import "./App.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CardStub {
  id: number;
  name: string;
  cardType: string;
  hasAltArt: number;
  imageId?: number;
  imgPath?: string;
  frameType?: string;
  // Flat list of all rarity strings across all sets (used for border/icon only)
  rarities: (string | null)[];
  totalCollectionAmount: number;
}

interface CardSetRarity {
  rarity?: string;
  collectionAmount?: number;
  setPrice?: number;
}

interface CardSet {
  setCode?: string;
  setName?: string;
  rarities: CardSetRarity[];
}

interface CardDetail {
  id: number;
  name: string;
  cardType: string;
  hasAltArt: number;
  imageId?: number;
  imgPath?: string;

  frameType?: string;
  attribute?: string;
  desc?: string;

  level?: number;
  atk?: number;
  def?: number;
  race?: string;
  scale?: number;
  linkval?: number;
  typeline?: string[];

  sets: CardSet[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const rarityGroups: Record<string, string[]> = {
  collectors_rare: ["Collector's Rare", "Cr"],
  common: [
    "Common",
    "Short Print",
    "Duel Terminal Normal Parallel Rare",
    "Duel Terminal Normal Rare Parallel Rare",
  ],
  extra_secret_rare: ["Extra Secret", "Extra Secret Rare"],
  ghost_rare: ["Ghost Rare", "Ghost/Gold Rare"],
  gold_rare: ["Gold Rare"],
  gold_secret_rare: ["Gold Secret Rare"],
  mosaic_rare: ["Mosaic Rare"],
  parallel_rare: ["Normal Parallel Rare"],
  platinum_rare: ["Platinum Rare"],
  platinum_secret_rare: ["Platinum Secret Rare"],
  premium_gold_rare: ["Premium Gold Rare"],
  quarter_century_secret_rare: ["Quarter Century Secret Rare"],
  rare: ["Rare", "Duel Terminal Rare Parallel Rare"],
  secret_parallel_rare: ["Secret Parallel Rare"],
  secret_rare: ["Secret Rare", "Prismatic Secret Rare"],
  shatterfoil: ["Shatterfoil Rare"],
  special: ["10000 Secret Rare", "Ultra Secret Rare"],
  starfoil: ["Starfoil", "Starfoil Rare"],
  starlight_rare: ["Starlight Rare"],
  super_parallel_rare: ["Super Parallel Rare"],
  super_rare: ["Super Rare", "Super Short Print", "Duel Terminal Super Parallel Rare"],
  ultimate_rare: ["Ultimate Rare"],
  ultra_parallel_rare: ["Ultra Parallel Rare", "Ultra Rare (Pharaoh's Rare)"],
  ultra_rare: ["Ultra Rare", "Duel Terminal Ultra Parallel Rare"],
  unknown: [
    "New", "2", "3",
    "European debut", "European & Oceanian debut", "Oceanian debut",
    "Reprint", "New artwork",
  ],
};

const rarityGroupColors: Record<string, string> = {
  collectors_rare:              "",
  common:                       "#030303",
  extra_secret_rare:            "#ff00dd",
  ghost_rare:                   "#ffffff",
  gold_rare:                    "#ddb812",
  gold_secret_rare:             "#ddb812",
  mosaic_rare:                  "#4cd64c",
  parallel_rare:                "#f1c40f",
  platinum_rare:                "#777777",
  platinum_secret_rare:         "#9b59b6",
  premium_gold_rare:            "#ddb812",
  quarter_century_secret_rare:  "#e74c3c",
  rare:                         "#363636",
  secret_parallel_rare:         "#9b59b6",
  secret_rare:                  "#9b59b6",
  shatterfoil:                  "#4cd64c",
  special:                      "#4cd64c",
  starfoil:                     "#4cd64c",
  starlight_rare:               "#ff00dd",
  super_parallel_rare:          "#f1ff6f",
  super_rare:                   "#f1ff6f",
  ultimate_rare:                "#3801ff",
  ultra_parallel_rare:          "#6194e0",
  ultra_rare:                   "#6194e0",
  unknown:                      "#030303",
};

const rarityGroupIcons: Record<string, string> = {
  collectors_rare:              "/rarities/collectors_rare.png",
  common:                       "/rarities/common.png",
  extra_secret_rare:            "/rarities/extra_secret_rare.png",
  ghost_rare:                   "/rarities/ghost_rare.png",
  gold_rare:                    "/rarities/gold_rare.png",
  gold_secret_rare:             "/rarities/gold_secret_rare.png",
  mosaic_rare:                  "/rarities/mosaic_rare.png",
  parallel_rare:                "/rarities/parallel_rare.png",
  platinum_rare:                "/rarities/platinum_rare.png",
  platinum_secret_rare:         "/rarities/platinum_secret_rare.png",
  premium_gold_rare:            "/rarities/premium_gold_rare.png",
  quarter_century_secret_rare:  "/rarities/quarter_century_secret_rare.png",
  rare:                         "/rarities/rare.png",
  secret_parallel_rare:         "/rarities/secret_parallel_rare.png",
  secret_rare:                  "/rarities/secret_rare.png",
  shatterfoil:                  "/rarities/shatterfoil.png",
  special:                      "/rarities/special.png",
  starfoil:                     "/rarities/starfoil_rare.png",
  starlight_rare:               "/rarities/starlight_rare.png",
  super_parallel_rare:          "/rarities/super_parallel_rare.png",
  super_rare:                   "/rarities/super_rare.png",
  ultimate_rare:                "/rarities/ultimate_rare.png",
  ultra_parallel_rare:          "/rarities/ultra_parallel_rare.png",
  ultra_rare:                   "/rarities/ultra_rare.png",
  unknown:                      "/rarities/token.png",
};

const FRAME_COLORS: Record<string, string> = {
  normal:  "#d4af37",
  effect:  "#d67c2f",
  fusion:  "#7b4fa3",
  synchro: "#f5f5f5",
  xyz:     "#111111",
  link:    "#1f3c88",
  ritual:  "#4aa3df",
  spell:   "#1f8f7a",
  trap:    "#c04c9b",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getRarityGroup(rarity?: string | null): string {
  if (!rarity) return "unknown";
  const normalized = rarity.trim().toLowerCase();
  for (const [group, values] of Object.entries(rarityGroups)) {
    if (values.some((v) => v.trim().toLowerCase() === normalized)) return group;
  }
  return "unknown";
}

function getFrameBackground(frameType?: string) {
  if (!frameType) return "#ccc";
  const normalized = frameType.toLowerCase();
  if (normalized.includes("_pendulum")) {
    const base = normalized.replace("_pendulum", "");
    const left = FRAME_COLORS[base] ?? "#ccc";
    const right = FRAME_COLORS["spell"];
    return `linear-gradient(to right, ${left} 0%, ${left} 48%, ${right} 52%, ${right} 100%)`;
  }
  return FRAME_COLORS[normalized] ?? "#ccc";
}

function formatTypeline(card: CardDetail) {
  if (card.typeline && Array.isArray(card.typeline)) {
    return `[${card.typeline.join("/")}]`;
  }
  if (card.frameType) {
    return `[${card.frameType.charAt(0).toUpperCase() + card.frameType.slice(1)}]`;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function App() {
  const [cards, setCards] = useState<CardStub[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>("ALL");
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);
  const [collectionOnly, setCollectionOnly] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  // Load sets once on mount
  useEffect(() => {
    invoke<string[]>("get_all_sets").then(setSets);
  }, []);

  // Debounce: only commit the search string to state 300ms after the user stops typing,
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reload stubs whenever filters change
  useEffect(() => {
    const params: Record<string, string> = {};
    if (search.trim().length > 0) params.name = search;
    if (selectedSet !== "ALL") params.set = selectedSet;
    invoke<CardStub[]>("load_card_stubs", params).then(setCards);
  }, [search, selectedSet]);

  // Track grid container width for the virtualised list
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setGridWidth(entries[0].contentRect.width);
    });
    if (gridRef.current) observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, []);

  // Fetch full detail when a grid card is clicked
  const handleCardClick = useCallback(async (stub: CardStub) => {
    setDetailLoading(true);
    try {
      const detail = await invoke<CardDetail>("load_card_detail", { cardId: stub.id });
      setSelectedCard(detail);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function updateCollection(
    e: React.MouseEvent,
    row: {
      id: number;
      setCode?: string;
      rarity?: string;
      collectionAmount?: number;
    }, delta: number) {
    e.preventDefault();
    e.stopPropagation();
    const newValue = Math.max(0, (row.collectionAmount ?? 0) + delta);

    try {
      await invoke("update_collection_amount", {
        cardId: row.id,
        setCode: row.setCode,
        rarity: row.rarity,
        amount: newValue,
      });
    } catch (err) {
      console.error("Failed to update collection amount:", err);
      return;
    }

    // Update the detail pane immutably
    setSelectedCard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sets: prev.sets.map((s) =>
          s.setCode !== row.setCode
            ? s
            : {
                ...s,
                rarities: s.rarities.map((r) =>
                  r.rarity !== row.rarity ? r : { ...r, collectionAmount: newValue }
                ),
              }
        ),
      };
    });
  }

  function renderIconOrText(path: string, fallback: string) {
    return (
      <img
        src={path}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        style={{ height: 18, marginRight: 6 }}
        alt={fallback}
      />
    );
  }

  function getIconPath(path: string) {
    return `/icons/${path}`;
  }

  function statRow(label: string, value: unknown, iconFile?: string) {
    return (
      <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {iconFile && renderIconOrText(getIconPath(iconFile), label)}
        <strong>{label}:</strong> {value != null ? String(value) : "–"}
      </div>
    );
  }

  function renderStats(card: CardDetail) {
    const type = card.frameType;
    if (!type) return null;

    const isPendulum = type.includes("_pendulum");
    const baseType = type.replace("_pendulum", "");
    const rows: React.ReactNode[] = [];

    if (["normal", "effect", "fusion", "synchro", "ritual"].includes(baseType)) {
      rows.push(statRow("Level", card.level, "Level.png"));
      rows.push(statRow("ATK", card.atk));
      rows.push(statRow("DEF", card.def));
      rows.push(statRow("Type", card.race, `types/${card.race}.png`));
    }
    if (baseType === "xyz") {
      rows.push(statRow("Rank", card.level, "Rank.png"));
      rows.push(statRow("ATK", card.atk));
      rows.push(statRow("DEF", card.def));
      rows.push(statRow("Type", card.race, `types/${card.race}.png`));
    }
    if (baseType === "link") {
      rows.push(statRow("L", card.linkval));
      rows.push(statRow("ATK", card.atk));
      rows.push(statRow("Type", card.race, `types/${card.race}.png`));
    }
    if (["spell", "trap"].includes(baseType)) {
      rows.push(statRow("Type", card.race, `types/${card.race}.png`));
    }
    if (isPendulum) {
      rows.push(statRow("Scale", card.scale, "Scale.png"));
    }

    return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{rows}</div>;
  }

  function renderRarityRow(r: {
    id: number;
    setCode?: string;
    rarity?: string;
    collectionAmount?: number;
    setPrice?: number;
  }) {
    const group = getRarityGroup(r.rarity);
    const icon = rarityGroupIcons[group];

    return (
      <div key={`${r.id}-${r.setCode}-${r.rarity}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <img src={icon} style={{ height: 20 }} />}
        <span>{r.collectionAmount ?? 0}</span>
        <button onClick={(e) => updateCollection(e, r, 1)}>+</button>
        <button onClick={(e) => updateCollection(e, r, -1)} disabled={(r.collectionAmount ?? 0) <= 0}>-</button>
        <span>{r.setPrice ?? "–"}</span>
      </div>
    );
  }

  const displayedCards = collectionOnly
    ? cards.filter((c) => c.totalCollectionAmount > 0)
    : cards;
  // Memoize detail-pane derived values — these only need recomputing when selectedCard changes,
  // not on every render triggered by e.g. grid hover or loading state changes
  const detailFrameBackground = useMemo(
    () => getFrameBackground(selectedCard?.frameType),
    [selectedCard?.frameType]
  );
  const detailTypeline = useMemo(
    () => (selectedCard ? formatTypeline(selectedCard) : ""),
    [selectedCard]
  );

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
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

      <div style={{ display: "flex", flexDirection: "row", gap: 20, minWidth: 20 }}>

        {/* LEFT: CARD GRID */}
        <div
          ref={gridRef}
          style={{ flex: 3, minWidth: 0, height: "calc(100vh - 180px)", overflow: "hidden" }}
        >
          {gridWidth > 0 && (() => {
            const CARD_WIDTH = 140;
            const CARD_HEIGHT = 180;
            const columnCount = Math.max(1, Math.floor(gridWidth / CARD_WIDTH));
            const rowCount = Math.ceil(cards.length / columnCount);

            return (
              <List
                style={{ height: "100%", width: gridWidth }}
                rowCount={rowCount}
                rowHeight={CARD_HEIGHT}
                rowProps={{} as never}
                rowComponent={({ index, style }: { index: number; style: React.CSSProperties }) => {
                  const start = index * columnCount;
                  const rowCards = displayedCards.slice(start, start + columnCount);

                  return (
                    <div style={{ ...style, display: "flex", gap: 10, padding: 5 }}>
                      {rowCards.map((c) => {
                        const firstRarity = c.rarities?.[0];
                        const group = getRarityGroup(firstRarity);
                        const rarityColor =
                          selectedCard?.id === c.id
                            ? "#4caf50"
                            : group
                            ? rarityGroupColors[group]
                            : "#ccc";

                        const additionalCount = (c.rarities?.length ?? 0) - 1;
                        const primaryGroup = getRarityGroup(firstRarity);
                        const primaryIcon = rarityGroupIcons[primaryGroup];

                        return (
                          <div
                            key={`${c.id}-${c.imageId ?? "base"}`}
                            style={{
                              position: "relative",
                              cursor: "pointer",
                              border: `2px solid ${rarityColor}`,
                              borderRadius: 8,
                              transition: "all 0.15s ease",
                            }}
                            onClick={() => handleCardClick(c)}
                          >
                            <img
                              src={c.imgPath?.replace("asset://", "/")}
                              width={120}
                              loading="lazy"
                              style={{ display: "block", borderRadius: 6 }}
                            />

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

                            {additionalCount > 0 && (
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
            overflow: "auto",
          }}
        >
          {!selectedCard && !detailLoading && <p>Select a card</p>}

          {detailLoading && <p>Loading…</p>}

          {selectedCard && !detailLoading && (
            <>
              {/* NAME + ATTRIBUTE */}
              <div
                style={{
                  background: getFrameBackground(selectedCard.frameType),
                  padding: "10px 15px",
                  borderRadius: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 15,
                }}
              >
                <h2 style={{ margin: 0 }}>{selectedCard.name}</h2>
                {selectedCard.attribute && (
                  <img
                    src={`/icons/attributes/${selectedCard.attribute}.png`}
                    style={{ height: 28 }}
                  />
                )}
              </div>

              {/* IMAGE + STATS */}
              <div style={{ display: "flex", gap: 20 }}>
                <img src={selectedCard.imgPath?.replace("asset://", "/")} width={250} />
                {renderStats(selectedCard)}
              </div>

              {/* TYPELINE BAR */}
              <div
                style={{
                  marginTop: 15,
                  padding: 8,
                  borderRadius: 4,
                  background: detailFrameBackground,
                  textAlign: "center",
                  fontWeight: "bold",
                }}
              >
                {detailTypeline}
              </div>

              {/* DESCRIPTION */}
              <div style={{ marginTop: 15, whiteSpace: "pre-wrap" }}>
                {selectedCard.desc}
              </div>

              {/* SET / RARITY SECTION */}
              <div style={{ marginTop: 20 }}>
                {selectedCard.sets.map((set: CardSet) => (
                  <div key={set.setCode ?? "unknown"} style={{ marginBottom: 12 }}>
                    <h4>{set.setName ?? set.setCode}</h4>
                    {set.rarities.map((r: CardSetRarity) =>
                      renderRarityRow({
                        id: selectedCard.id,
                        setCode: set.setCode,
                        rarity: r.rarity,
                        collectionAmount: r.collectionAmount,
                        setPrice: r.setPrice,
                      })
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
