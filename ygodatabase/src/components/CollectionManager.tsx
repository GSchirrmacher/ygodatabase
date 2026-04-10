import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { List } from "react-window";

import type { CardStub, CardDetail, CardSet, CardSetRarity } from "../types/cards";
import AltArtEditor from "./AltArtEditor";
import { getRarityGroup, getFrameBackground, formatTypeline } from "../utils/cardUtils";
import { rarityGroupColors, rarityGroupIcons } from "../constants/rarity";

interface CollectionManagerProps {
  onBack: () => void;
}

export default function CollectionManager({ onBack }: CollectionManagerProps) {
  const [cards, setCards] = useState<CardStub[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>("ALL");
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);
  const [collectionOnly, setCollectionOnly] = useState(false);
  const [altArtMode, setAltArtMode] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [collectionValue, setCollectionValue] = useState<number>(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    invoke<string[]>("get_all_sets").then(setSets);
    invoke("ensure_artwork_column").catch(() => {});
    invoke<number>("get_collection_value").then(setCollectionValue).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const latestRequestId = useRef(0);
  useEffect(() => {
    const requestId = ++latestRequestId.current;
    const params: Record<string, string> = {};
    if (search.trim().length > 0) params.name = search;
    if (selectedSet !== "ALL") {
      params.set  = selectedSet;
      params.sort = "set";
    } else {
      params.sort = "type";
    }
    invoke<CardStub[]>("load_card_stubs", params).then((result) => {
      if (requestId === latestRequestId.current) setCards(result);
    });
  }, [search, selectedSet]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setGridWidth(entries[0].contentRect.width);
    });
    if (gridRef.current) observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, []);

  const handleCardClick = useCallback(async (stub: CardStub) => {
    setDetailLoading(true);
    try {
      const detail = await invoke<CardDetail>("load_card_detail", {
        cardId: stub.id,
        setName: selectedSet === "ALL" ? null : selectedSet,
        artwork: stub.imageId != null ? stub.imageId - stub.id : 0,
      });
      setSelectedCard(detail);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedSet]);

  async function updateCollection(
    e: React.MouseEvent,
    row: { id: number; setCode?: string; rarity?: string; artwork: number; collectionAmount?: number },
    delta: number
  ) {
    e.preventDefault();
    e.stopPropagation();
    const newValue = Math.max(0, (row.collectionAmount ?? 0) + delta);
    try {
      await invoke("update_collection_amount", {
        cardId: row.id,
        setCode: row.setCode,
        rarity: row.rarity,
        artwork: row.artwork,
        amount: newValue,
      });
    } catch (err) {
      console.error("Failed to update collection amount:", err);
      return;
    }
    // Refresh total value after any collection change
    invoke<number>("get_collection_value").then(setCollectionValue).catch(() => {});
    setSelectedCard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sets: prev.sets.map((s) =>
          s.setCode !== row.setCode ? s : {
            ...s,
            rarities: s.rarities.map((r) =>
              r.rarity !== row.rarity || r.artwork !== row.artwork ? r : { ...r, collectionAmount: newValue }
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

  function statRow(label: string, value: unknown, iconFile?: string) {
    return (
      <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {iconFile && renderIconOrText(`/icons/${iconFile}`, label)}
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
    id: number; setCode?: string; rarity?: string;
    artwork: number; collectionAmount?: number; setPrice?: number;
  }) {
    const group = getRarityGroup(r.rarity);
    const icon = rarityGroupIcons[group];
    const formattedPrice = r.setPrice != null ? `${r.setPrice.toFixed(2)}€` : "–";
    return (
      <div key={`${r.id}-${r.setCode}-${r.rarity}-${r.artwork}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <img src={icon} style={{ height: 20 }} alt={r.rarity} />}
        <span style={{ minWidth: 20, textAlign: "right" }}>{r.collectionAmount ?? 0}</span>
        <button onClick={(e) => updateCollection(e, r, 1)}>+</button>
        <button onClick={(e) => updateCollection(e, r, -1)} disabled={(r.collectionAmount ?? 0) <= 0}>-</button>
        <span style={{ color: "#4caf50", fontWeight: "bold", minWidth: 48 }}>{formattedPrice}</span>
      </div>
    );
  }

  const displayedCards = collectionOnly
    ? cards.filter((c) => c.totalCollectionAmount > 0)
    : cards;

  const detailFrameBackground = useMemo(
    () => getFrameBackground(selectedCard?.frameType),
    [selectedCard?.frameType]
  );
  const detailTypeline = useMemo(
    () => (selectedCard ? formatTypeline(selectedCard) : ""),
    [selectedCard]
  );

  const CARD_WIDTH = 140;
  const CARD_HEIGHT = 180;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&display=swap');

        .cm-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          box-sizing: border-box;
        }

        .cm-topbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(212,175,55,0.2);
          background: rgba(255,255,255,0.02);
          flex-shrink: 0;
        }

        .cm-back-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 16px;
          background: transparent;
          color: rgba(200,150,40,0.8);
          border: 1px solid rgba(200,150,40,0.3);
          border-radius: 2px;
          cursor: pointer;
          font-family: 'Cinzel', serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          white-space: nowrap;
        }
        .cm-back-btn:hover {
          color: #f0d060;
          border-color: rgba(212,175,55,0.6);
          background: rgba(212,175,55,0.06);
        }

        .cm-topbar-title {
          font-family: 'Cinzel', serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.3em;
          color: rgba(200,150,40,0.6);
          text-transform: uppercase;
        }

        .cm-topbar-filters {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-left: auto;
        }
      `}</style>

      <div className="cm-root">

        {/* ── TOP BAR: back button + title + filters ── */}
        <div className="cm-topbar">
          <button className="cm-back-btn" onClick={onBack}>
            ← Main Menu
          </button>

          <span className="cm-topbar-title">Collection Manager</span>

          <div className="cm-topbar-filters">
            <select value={selectedSet} onChange={(e) => setSelectedSet(e.target.value)}>
              <option value="ALL">All Sets</option>
              {sets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

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
            <button
              onClick={() => setAltArtMode((v) => !v)}
              style={{
                background: altArtMode ? "rgba(212,175,55,0.15)" : undefined,
                color: altArtMode ? "#f0d060" : undefined,
                border: altArtMode ? "1px solid rgba(212,175,55,0.6)" : undefined,
              }}
            >
              {altArtMode ? "✦ Alt Art Editor" : "Alt Art Editor"}
            </button>
          </div>
        </div>
        {/* ── ALT ART EDITOR OVERLAY ── */}
        {altArtMode && (
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <AltArtEditor />
          </div>
        )}

        {/* ── COLLECTION VALUE BAR ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "8px 20px",
          borderBottom: "1px solid rgba(212,175,55,0.12)",
          background: "rgba(0,0,0,0.08)",
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(200,150,40,0.55)",
          }}>
            Collection Value
          </span>
          <span style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 15,
            fontWeight: 600,
            color: collectionValue > 0 ? "#4caf50" : "rgba(200,150,40,0.3)",
            letterSpacing: "0.05em",
          }}>
            {collectionValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
          </span>
        </div>

        {/* ── MAIN CONTENT: grid + detail pane ── */}
        {!altArtMode && (
        <div style={{ display: "flex", flexDirection: "row", gap: 20, padding: "16px 20px", flex: 1, minHeight: 0 }}>

          {/* LEFT: CARD GRID */}
          <div ref={gridRef} style={{ flex: 3, minWidth: 0, height: "100%", overflow: "hidden" }}>
            {gridWidth > 0 && (() => {
              const columnCount = Math.max(1, Math.floor(gridWidth / CARD_WIDTH));
              const rowCount = Math.ceil(displayedCards.length / columnCount);
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
                          const rarityColor = selectedCard?.id === c.id
                            ? "#4caf50"
                            : rarityGroupColors[group] ?? "#ccc";
                          const additionalCount = (c.rarities?.length ?? 0) - 1;
                          const primaryIcon = rarityGroupIcons[getRarityGroup(firstRarity)];
                          return (
                            <div
                              key={`${c.id}-${c.imageId ?? 0}`}
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
                                <img src={primaryIcon} width={24} style={{
                                  position: "absolute", bottom: 6, right: 36,
                                  background: "rgba(0,0,0,0.6)", padding: 3, borderRadius: 6,
                                }} />
                              )}
                              {additionalCount > 0 && (
                                <div style={{
                                  position: "absolute", bottom: 6, right: 6,
                                  background: "rgba(0,0,0,0.75)", color: "white",
                                  fontSize: 12, padding: "2px 6px", borderRadius: 6,
                                }}>+{additionalCount}</div>
                              )}
                              {c.totalCollectionAmount > 0 && (
                                <div style={{
                                  position: "absolute", top: 6, left: 6,
                                  background: "rgba(76,175,80,0.9)", color: "white",
                                  fontSize: 12, fontWeight: "bold", padding: "2px 6px", borderRadius: 6,
                                }}>{c.totalCollectionAmount}×</div>
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
          <div style={{
            flex: 2, minWidth: 0, padding: 20,
            border: "1px solid #ccc", borderRadius: 8,
            overflow: "auto", height: "100%", boxSizing: "border-box",
          }}>
            {!selectedCard && !detailLoading && <p>Select a card</p>}
            {detailLoading && <p>Loading…</p>}
            {selectedCard && !detailLoading && (
              <>
                <div style={{
                  background: getFrameBackground(selectedCard.frameType),
                  padding: "10px 15px", borderRadius: 6,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: 15,
                }}>
                  <h2 style={{ margin: 0 }}>{selectedCard.name}</h2>
                  {selectedCard.attribute && (
                    <img src={`/icons/attributes/${selectedCard.attribute}.png`} style={{ height: 28 }} alt={selectedCard.attribute} />
                  )}
                </div>
                <div style={{ display: "flex", gap: 20 }}>
                  <img src={selectedCard.imgPath?.replace("asset://", "/")} width={250} alt={selectedCard.name} />
                  {renderStats(selectedCard)}
                </div>
                <div style={{
                  marginTop: 15, padding: 8, borderRadius: 4,
                  background: detailFrameBackground, textAlign: "center", fontWeight: "bold",
                }}>
                  {detailTypeline}
                </div>
                <div style={{ marginTop: 15, whiteSpace: "pre-wrap" }}>{selectedCard.desc}</div>
                <div style={{ marginTop: 20 }}>
                  {selectedCard.sets.map((set: CardSet) => (
                    <div key={set.setCode ?? "unknown"} style={{ marginBottom: 12 }}>
                      <h4>{set.setName ?? set.setCode}</h4>
                      {set.rarities.map((r: CardSetRarity) =>
                        renderRarityRow({
                          id: selectedCard.id,
                          setCode: set.setCode,
                          rarity: r.rarity,
                          artwork: r.artwork,
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
      )}
      </div>
    </>
  );
}