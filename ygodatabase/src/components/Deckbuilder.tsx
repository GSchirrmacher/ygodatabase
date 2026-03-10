import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { List } from "react-window";

import type { CardStub, CardDetail } from "../types/cards";
import { getFrameBackground, formatTypeline } from "../utils/cardUtils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DeckEntry {
  id: number;
  name: string;
  imgPath?: string;
  frameType?: string;
}

interface Deck {
  main: DeckEntry[];
  extra: DeckEntry[];
  side: DeckEntry[];
}

interface BanList {
  forbidden: number[];
  limited: number[];
  semiLimited: number[];
}

type DeckTarget = "main" | "side"; // extra is always auto-routed

interface DeckbuilderProps {
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EXTRA_FRAME_TYPES = new Set(["fusion", "synchro", "xyz", "link"]);

function isExtraCard(frameType?: string): boolean {
  if (!frameType) return false;
  const base = frameType.toLowerCase().replace("_pendulum", "");
  return EXTRA_FRAME_TYPES.has(base);
}

function countInDeck(deck: Deck, id: number): number {
  return (
    deck.main.filter((e) => e.id === id).length +
    deck.extra.filter((e) => e.id === id).length +
    deck.side.filter((e) => e.id === id).length
  );
}

function maxCopies(banList: BanList, id: number): number {
  if (banList.forbidden.includes(id)) return 0;
  if (banList.limited.includes(id)) return 1;
  if (banList.semiLimited.includes(id)) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Deckbuilder({ onBack }: DeckbuilderProps) {
  // ── Card browser state ──────────────────────────────────────────────────
  const [cards, setCards] = useState<CardStub[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  // ── Deck state ───────────────────────────────────────────────────────────
  const [deck, setDeck] = useState<Deck>({ main: [], extra: [], side: [] });
  const [deckTarget, setDeckTarget] = useState<DeckTarget>("main");
  const [banList, setBanList] = useState<BanList>({ forbidden: [], limited: [], semiLimited: [] });
  const [collapsed, setCollapsed] = useState({ main: false, extra: false, side: false });

  // ── Drag state ───────────────────────────────────────────────────────────
  const draggingId = useRef<number | null>(null);
  const isDragging = useRef(false);

  // ── Load ban list once ───────────────────────────────────────────────────
  useEffect(() => {
    invoke<BanList>("get_ban_list")
      .then(setBanList)
      .catch(() => {}); // silently ignore missing file
  }, []);

  // ── Search debounce ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Load card stubs ──────────────────────────────────────────────────────
  const latestReq = useRef(0);
  useEffect(() => {
    const id = ++latestReq.current;
    const params: Record<string, string> = {};
    if (search.trim()) params.name = search;
    invoke<CardStub[]>("load_card_stubs", params).then((r) => {
      if (id === latestReq.current) setCards(r);
    });
  }, [search]);

  // ── Grid resize observer ─────────────────────────────────────────────────
  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      if (entries[0]) setGridWidth(entries[0].contentRect.width);
    });
    if (gridRef.current) obs.observe(gridRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Card detail fetch ────────────────────────────────────────────────────
  const handleCardClick = useCallback(async (stub: CardStub) => {
    setDetailLoading(true);
    try {
      const detail = await invoke<CardDetail>("load_card_detail", { cardId: stub.id, setName: null });
      setSelectedCard(detail);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Deck mutations ───────────────────────────────────────────────────────
  function addToDeck(stub: CardStub) {
    setDeck((prev) => {
      const copies = countInDeck(prev, stub.id);
      const max = maxCopies(banList, stub.id);
      if (copies >= max) return prev;

      const entry: DeckEntry = {
        id: stub.id,
        name: stub.name,
        imgPath: stub.imgPath,
        frameType: stub.frameType,
      };

      if (isExtraCard(stub.frameType)) {
        if (prev.extra.length >= 15) return prev;
        return { ...prev, extra: [...prev.extra, entry] };
      }
      if (deckTarget === "side") {
        if (prev.side.length >= 15) return prev;
        return { ...prev, side: [...prev.side, entry] };
      }
      if (prev.main.length >= 60) return prev;
      return { ...prev, main: [...prev.main, entry] };
    });
  }

  function removeOneFromDeck(id: number, section: keyof Deck) {
    setDeck((prev) => {
      const arr = [...prev[section]];
      const idx = arr.findLastIndex((e) => e.id === id);
      if (idx === -1) return prev;
      arr.splice(idx, 1);
      return { ...prev, [section]: arr };
    });
  }

  // Remove from whichever section contains the card (right-click on grid)
  function removeFromDeckAny(id: number) {
    setDeck((prev) => {
      for (const section of ["main", "extra", "side"] as (keyof Deck)[]) {
        const arr = [...prev[section]];
        const idx = arr.findLastIndex((e) => e.id === id);
        if (idx !== -1) {
          arr.splice(idx, 1);
          return { ...prev, [section]: arr };
        }
      }
      return prev;
    });
  }

  // ── Drag handlers ────────────────────────────────────────────────────────
  function handleDragStart(stub: CardStub) {
    draggingId.current = stub.id;
    isDragging.current = true;
    // Store stub data for the drop handler
    (window as any).__deckDragStub = stub;
  }

  function handleDragEnd() {
    isDragging.current = false;
    draggingId.current = null;
    (window as any).__deckDragStub = null;
  }

  function handleDeckDrop(e: React.DragEvent) {
    e.preventDefault();
    const stub = (window as any).__deckDragStub as CardStub | null;
    if (stub) addToDeck(stub);
    handleDragEnd();
  }

  // ── Derived: grouped unique cards for deck panel display ─────────────────
  function groupSection(entries: DeckEntry[]): { entry: DeckEntry; count: number }[] {
    const seen = new Map<number, { entry: DeckEntry; count: number }>();
    for (const e of entries) {
      if (seen.has(e.id)) seen.get(e.id)!.count++;
      else seen.set(e.id, { entry: e, count: 1 });
    }
    return Array.from(seen.values());
  }

  // ── Ban status helper for grid overlay ──────────────────────────────────
  function banStatus(id: number): "forbidden" | "limited" | "semi" | null {
    if (banList.forbidden.includes(id)) return "forbidden";
    if (banList.limited.includes(id)) return "limited";
    if (banList.semiLimited.includes(id)) return "semi";
    return null;
  }

  // ── Copies in deck for grid overlay ─────────────────────────────────────
  const deckCountById = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of [...deck.main, ...deck.extra, ...deck.side]) {
      m.set(e.id, (m.get(e.id) ?? 0) + 1);
    }
    return m;
  }, [deck]);

  // ── Detail pane memos ────────────────────────────────────────────────────
  const detailFrameBg = useMemo(() => getFrameBackground(selectedCard?.frameType), [selectedCard?.frameType]);
  const detailTypeline = useMemo(() => selectedCard ? formatTypeline(selectedCard) : "", [selectedCard]);

  function renderIconOrText(path: string, fallback: string) {
    return <img src={path} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} style={{ height: 18, marginRight: 6 }} alt={fallback} />;
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
    if (isPendulum) rows.push(statRow("Scale", card.scale, "Scale.png"));
    return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{rows}</div>;
  }

  const CARD_WIDTH = 140;
  const CARD_HEIGHT = 180;
  const BAN_COLORS: Record<string, string> = { forbidden: "#e74c3c", limited: "#f0a500", semi: "#f0d060" };
  const BAN_LABELS: Record<string, string> = { forbidden: "●", limited: "●", semi: "●" };

  // ── Deck section renderer ────────────────────────────────────────────────
  function renderDeckSection(
    label: string,
    section: keyof Deck,
    max: number,
  ) {
    const entries = deck[section];
    const grouped = groupSection(entries);
    const isCollapsed = collapsed[section];

    return (
      <div style={{ marginBottom: 12 }}>
        {/* Section header */}
        <div
          className="deck-section-header"
          onClick={() => setCollapsed((p) => ({ ...p, [section]: !p[section] }))}
        >
          <span>{label}</span>
          <span style={{
            fontSize: 11,
            color: entries.length > max ? "#e74c3c" : "rgba(200,150,40,0.5)",
          }}>
            {entries.length}/{max}
          </span>
          <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 11 }}>
            {isCollapsed ? "▶" : "▼"}
          </span>
        </div>

        {/* Card thumbnails */}
        {!isCollapsed && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 4px" }}>
            {grouped.map(({ entry, count }) => (
              <div
                key={entry.id}
                className="deck-card-thumb"
                title={`${entry.name} (×${count}) — right-click to remove`}
                onContextMenu={(e) => { e.preventDefault(); removeOneFromDeck(entry.id, section); }}
              >
                <img
                  src={entry.imgPath?.replace("asset://", "/")}
                  width={52}
                  style={{ display: "block", borderRadius: 4 }}
                  draggable={false}
                />
                {count > 1 && (
                  <div className="deck-card-count">×{count}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&display=swap');

        .db-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          box-sizing: border-box;
        }

        .db-topbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(212,175,55,0.2);
          background: rgba(255,255,255,0.02);
          flex-shrink: 0;
        }

        .db-back-btn {
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
        .db-back-btn:hover {
          color: #f0d060;
          border-color: rgba(212,175,55,0.6);
          background: rgba(212,175,55,0.06);
        }

        .db-topbar-title {
          font-family: 'Cinzel', serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.3em;
          color: rgba(200,150,40,0.6);
          text-transform: uppercase;
        }

        .db-topbar-filters {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-left: auto;
        }

        /* ── Deck target tabs ── */
        .deck-target-tabs {
          display: flex;
          gap: 6px;
        }
        .deck-tab {
          padding: 5px 12px;
          border-radius: 2px;
          border: 1px solid rgba(200,150,40,0.25);
          background: transparent;
          color: rgba(200,150,40,0.5);
          cursor: pointer;
          font-family: 'Cinzel', serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          transition: all 0.15s;
        }
        .deck-tab.active {
          background: rgba(212,175,55,0.12);
          border-color: rgba(212,175,55,0.6);
          color: #f0d060;
        }
        .deck-tab:hover:not(.active) {
          border-color: rgba(212,175,55,0.4);
          color: rgba(200,150,40,0.75);
        }

        /* ── Deck panel ── */
        .deck-panel {
          flex: 2;
          min-width: 0;
          border: 1px solid #333;
          border-radius: 8px;
          overflow: auto;
          height: 100%;
          box-sizing: border-box;
          padding: 12px;
          background: rgba(0,0,0,0.15);
        }
        .deck-panel.drag-over {
          border-color: rgba(212,175,55,0.6);
          background: rgba(212,175,55,0.04);
        }

        .deck-section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 4px;
          cursor: pointer;
          font-family: 'Cinzel', serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(200,150,40,0.7);
          border-bottom: 1px solid rgba(212,175,55,0.15);
          user-select: none;
        }
        .deck-section-header:hover {
          color: rgba(200,150,40,0.95);
        }

        /* ── Deck card thumbnail ── */
        .deck-card-thumb {
          position: relative;
          cursor: context-menu;
          border-radius: 4px;
          border: 1px solid transparent;
          transition: border-color 0.12s, opacity 0.12s;
          line-height: 0;
        }
        .deck-card-thumb:hover {
          border-color: rgba(220,80,80,0.7);
          opacity: 0.85;
        }
        .deck-card-count {
          position: absolute;
          bottom: 2px;
          right: 2px;
          background: rgba(0,0,0,0.78);
          color: #f0d060;
          font-size: 10px;
          font-weight: bold;
          padding: 1px 4px;
          border-radius: 3px;
          line-height: 1.4;
        }

        /* ── Grid card ── */
        .grid-card {
          position: relative;
          cursor: pointer;
          border-radius: 8px;
          transition: border-color 0.15s ease;
          line-height: 0;
          user-select: none;
        }
        .grid-card:active {
          opacity: 0.85;
        }

        .ban-dot {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          border: 1px solid rgba(0,0,0,0.5);
        }

        .deck-in-use {
          position: absolute;
          top: 4px;
          left: 4px;
          background: rgba(0,0,0,0.72);
          color: #f0d060;
          font-size: 10px;
          font-weight: bold;
          padding: 1px 5px;
          border-radius: 3px;
          line-height: 1.5;
        }
      `}</style>

      <div className="db-root">

        {/* ── TOP BAR ── */}
        <div className="db-topbar">
          <button className="db-back-btn" onClick={onBack}>← Main Menu</button>
          <span className="db-topbar-title">Deck Builder</span>
          <div className="db-topbar-filters">
            {/* Add-to target: Main or Side (Extra is always auto-routed) */}
            <div className="deck-target-tabs">
              <button
                className={`deck-tab ${deckTarget === "main" ? "active" : ""}`}
                onClick={() => setDeckTarget("main")}
              >Main</button>
              <button
                className={`deck-tab ${deckTarget === "side" ? "active" : ""}`}
                onClick={() => setDeckTarget("side")}
              >Side</button>
            </div>
            <input
              type="text"
              placeholder="Search name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{ display: "flex", flexDirection: "row", gap: 20, padding: "16px 20px", flex: 1, minHeight: 0 }}>

          {/* LEFT: CARD DETAIL */}
          <div style={{
            flex: 2, minWidth: 0, padding: 20,
            border: "1px solid #333", borderRadius: 8,
            overflow: "auto", height: "100%", boxSizing: "border-box",
          }}>
            {!selectedCard && !detailLoading && <p style={{ color: "#555" }}>Select a card</p>}
            {detailLoading && <p style={{ color: "#555" }}>Loading…</p>}
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
                  background: detailFrameBg, textAlign: "center", fontWeight: "bold",
                }}>
                  {detailTypeline}
                </div>
                <div style={{ marginTop: 15, whiteSpace: "pre-wrap" }}>{selectedCard.desc}</div>
              </>
            )}
          </div>

          {/* MIDDLE: CARD GRID */}
          <div
            ref={gridRef}
            style={{ flex: 3, minWidth: 0, height: "100%", overflow: "hidden" }}
          >
            {gridWidth > 0 && (() => {
              const colCount = Math.max(1, Math.floor(gridWidth / CARD_WIDTH));
              const rowCount = Math.ceil(cards.length / colCount);
              return (
                <List
                  style={{ height: "100%", width: gridWidth }}
                  rowCount={rowCount}
                  rowHeight={CARD_HEIGHT}
                  rowProps={{} as never}
                  rowComponent={({ index, style }: { index: number; style: React.CSSProperties }) => {
                    const start = index * colCount;
                    const rowCards = cards.slice(start, start + colCount);
                    return (
                      <div style={{ ...style, display: "flex", gap: 10, padding: 5 }}>
                        {rowCards.map((c) => {
                          const isSelected = selectedCard?.id === c.id;
                          const inDeck = deckCountById.get(c.id) ?? 0;
                          const max = maxCopies(banList, c.id);
                          const atLimit = inDeck >= max;
                          const ban = banStatus(c.id);

                          return (
                            <div
                              key={`${c.id}-${c.imageId ?? "base"}`}
                              className="grid-card"
                              style={{
                                border: `2px solid ${isSelected ? "#4caf50" : atLimit ? "#555" : "#444"}`,
                                opacity: atLimit && inDeck > 0 ? 0.55 : 1,
                              }}
                              draggable
                              onDragStart={() => handleDragStart(c)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => {
                                // Left-click: add to deck AND show detail
                                // Use mousedown button check isn't needed — onClick is always left
                                handleCardClick(c);
                                addToDeck(c);
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                removeFromDeckAny(c.id);
                              }}
                            >
                              <img
                                src={c.imgPath?.replace("asset://", "/")}
                                width={120}
                                loading="lazy"
                                style={{ display: "block", borderRadius: 6 }}
                                draggable={false}
                              />

                              {/* Ban status dot */}
                              {ban && (
                                <div
                                  className="ban-dot"
                                  style={{ background: BAN_COLORS[ban] }}
                                  title={ban}
                                />
                              )}

                              {/* Deck copy counter */}
                              {inDeck > 0 && (
                                <div className="deck-in-use">
                                  {inDeck}/{max}
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

          {/* RIGHT: DECK PANEL */}
          <div
            className="deck-panel"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("drag-over"); }}
            onDrop={(e) => { e.currentTarget.classList.remove("drag-over"); handleDeckDrop(e); }}
          >
            {renderDeckSection("Main Deck", "main", 60)}
            {renderDeckSection("Extra Deck", "extra", 15)}
            {renderDeckSection("Side Deck", "side", 15)}
          </div>

        </div>
      </div>
    </>
  );
}
