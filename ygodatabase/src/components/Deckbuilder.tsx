import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { List } from "react-window";

import type { CardStub, CardDetail } from "../types/cards";
import { getFrameBackground, formatTypeline, filtersToParams } from "../utils/cardUtils";
import CardFiltersBar from "./CardFilters";
import type { CardFilters } from "../types/filters";
import { EMPTY_FILTERS } from "../types/filters";

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

// Shape returned by the load_deck command
interface LoadedDeck {
  name: string;
  main:  DeckStub[];
  extra: DeckStub[];
  side:  DeckStub[];
}
interface DeckStub {
  id: number;
  name: string;
  imgPath?: string;
  frameType?: string;
}

type DeckTarget = "main" | "side";

interface DeckbuilderProps {
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EXTRA_FRAME_TYPES = new Set(["fusion", "synchro", "xyz", "link"]);

function isExtraCard(frameType?: string): boolean {
  if (!frameType) return false;
  return EXTRA_FRAME_TYPES.has(frameType.toLowerCase().replace("_pendulum", ""));
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

function stubToDeckEntry(s: DeckStub): DeckEntry {
  return { id: s.id, name: s.name, imgPath: s.imgPath, frameType: s.frameType };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Deckbuilder({ onBack }: DeckbuilderProps) {
  // ── Card browser ─────────────────────────────────────────────────────────
  const [cards, setCards] = useState<CardStub[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CardFilters>(EMPTY_FILTERS);
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  // ── Deck ─────────────────────────────────────────────────────────────────
  const [deck, setDeck] = useState<Deck>({ main: [], extra: [], side: [] });
  const [deckTarget, setDeckTarget] = useState<DeckTarget>("main");
  const [banList, setBanList] = useState<BanList>({ forbidden: [], limited: [], semiLimited: [] });
  const [banFormat, setBanFormat] = useState<"tcg" | "ocg" | "goat">("tcg");
  const [collapsed, setCollapsed] = useState({ main: false, extra: false, side: false });

  // ── Save / load ───────────────────────────────────────────────────────────
  const [deckList, setDeckList] = useState<string[]>([]);
  const [deckName, setDeckName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  // ── Collection comparison ─────────────────────────────────────────────────
  // Map of card_id → total copies owned across the whole collection
  const [collectionAmounts, setCollectionAmounts] = useState<Record<number, number>>({});
  const [compareMode, setCompareMode] = useState(false);

  // ── Drag ─────────────────────────────────────────────────────────────────
  const dragStub = useRef<CardStub | null>(null);

  // ── Bootstrap + format switch ────────────────────────────────────────────
  // Syncs banlist.json from the DB for the active format, then reloads it.
  async function syncAndReload(fmt: "tcg" | "ocg" | "goat") {
    try {
      await invoke("sync_banlist_from_db", { format: fmt });
    } catch (err) {
      console.error("Ban list sync failed:", err);
    }
    invoke<BanList>("get_ban_list").then(setBanList).catch(() => {});
  }

  useEffect(() => {
    syncAndReload(banFormat);
    refreshDeckList();
    invoke<Record<number, number>>("get_collection_amounts").then(setCollectionAmounts).catch(() => {});
  }, []);

  // Re-sync whenever the user switches format
  useEffect(() => {
    syncAndReload(banFormat);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banFormat]);

  function refreshDeckList() {
    invoke<string[]>("list_decks").then(setDeckList).catch(() => {});
  }

  // ── Search debounce ───────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Load card stubs ───────────────────────────────────────────────────────
  const latestReq = useRef(0);
  useEffect(() => {
    const reqId = ++latestReq.current;
    setCardLoading(true);
    const params = { ...filtersToParams({ ...filters, name: search }), sort: "type" };
    invoke<CardStub[]>("load_card_stubs", params).then((r) => {
      if (reqId === latestReq.current) { setCards(r); setCardLoading(false); }
    }).catch(() => setCardLoading(false));
  }, [search, filters]);

  // ── Grid resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      if (entries[0]) setGridWidth(entries[0].contentRect.width);
    });
    if (gridRef.current) obs.observe(gridRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Card detail ───────────────────────────────────────────────────────────
  const handleCardClick = useCallback(async (stub: CardStub) => {
    setDetailLoading(true);
    try {
      const detail = await invoke<CardDetail>("load_card_detail", { cardId: stub.id, setName: null });
      setSelectedCard(detail);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Deck mutations ────────────────────────────────────────────────────────
  function addToDeck(stub: CardStub) {
    setDeck((prev) => {
      if (countInDeck(prev, stub.id) >= maxCopies(banList, stub.id)) return prev;
      const entry: DeckEntry = { id: stub.id, name: stub.name, imgPath: stub.imgPath, frameType: stub.frameType };
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

  function removeOneFromSection(id: number, section: keyof Deck) {
    setDeck((prev) => {
      const arr = [...prev[section]];
      const idx = arr.findLastIndex((e) => e.id === id);
      if (idx === -1) return prev;
      arr.splice(idx, 1);
      return { ...prev, [section]: arr };
    });
  }

  function removeFromDeckAny(id: number) {
    setDeck((prev) => {
      for (const s of ["main", "extra", "side"] as (keyof Deck)[]) {
        const arr = [...prev[s]];
        const idx = arr.findLastIndex((e) => e.id === id);
        if (idx !== -1) { arr.splice(idx, 1); return { ...prev, [s]: arr }; }
      }
      return prev;
    });
  }

  // ── Drag ──────────────────────────────────────────────────────────────────
  function handleDragStart(stub: CardStub) { dragStub.current = stub; }
  function handleDragEnd()                 { dragStub.current = null; }
  function handleDeckDrop(e: React.DragEvent) {
    e.preventDefault();
    if (dragStub.current) addToDeck(dragStub.current);
    dragStub.current = null;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    const name = deckName.trim();
    if (!name) return;
    try {
      await invoke("save_deck", {
        name,
        mainIds:  deck.main.map((e) => e.id),
        extraIds: deck.extra.map((e) => e.id),
        sideIds:  deck.side.map((e) => e.id),
      });
      setSaveStatus("saved");
      refreshDeckList();
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  async function handleLoad(name: string) {
    if (!name) return;
    try {
      const loaded = await invoke<LoadedDeck>("load_deck", { name });
      setDeck({
        main:  loaded.main.map(stubToDeckEntry),
        extra: loaded.extra.map(stubToDeckEntry),
        side:  loaded.side.map(stubToDeckEntry),
      });
      setDeckName(loaded.name);
    } catch (err) {
      console.error("Failed to load deck:", err);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    const name = deckName.trim();
    if (!name) return;
    if (!window.confirm(`Delete deck "${name}"?`)) return;
    try {
      await invoke("delete_deck", { name });
      setDeck({ main: [], extra: [], side: [] });
      setDeckName("");
      refreshDeckList();
    } catch (err) {
      console.error("Failed to delete deck:", err);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  function groupSection(entries: DeckEntry[]): { entry: DeckEntry; count: number }[] {
    const seen = new Map<number, { entry: DeckEntry; count: number }>();
    for (const e of entries) {
      if (seen.has(e.id)) seen.get(e.id)!.count++;
      else seen.set(e.id, { entry: e, count: 1 });
    }
    return Array.from(seen.values());
  }

  const deckCountById = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of [...deck.main, ...deck.extra, ...deck.side])
      m.set(e.id, (m.get(e.id) ?? 0) + 1);
    return m;
  }, [deck]);

  function banStatus(id: number): "forbidden" | "limited" | "semi" | null {
    if (banList.forbidden.includes(id)) return "forbidden";
    if (banList.limited.includes(id)) return "limited";
    if (banList.semiLimited.includes(id)) return "semi";
    return null;
  }

  const detailFrameBg  = useMemo(() => getFrameBackground(selectedCard?.frameType), [selectedCard?.frameType]);
  const detailTypeline = useMemo(() => selectedCard ? formatTypeline(selectedCard) : "", [selectedCard]);

  // ── Stat rendering ────────────────────────────────────────────────────────
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
    if (["spell", "trap"].includes(baseType)) rows.push(statRow("Type", card.race, `types/${card.race}.png`));
    if (isPendulum) rows.push(statRow("Scale", card.scale, "Scale.png"));
    return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{rows}</div>;
  }

  // ── Copy / wants list ─────────────────────────────────────────────────────
  function buildYdk(): string {
    const lines = ["#created by Player", "#main"];
    deck.main.forEach((e)  => lines.push(String(e.id)));
    lines.push("#extra");
    deck.extra.forEach((e) => lines.push(String(e.id)));
    lines.push("!side");
    deck.side.forEach((e)  => lines.push(String(e.id)));
    return lines.join("\n");
  }

  const [copyYdkStatus,   setCopyYdkStatus]   = useState<"idle"|"ok"|"err">("idle");
  const [copyWantsStatus, setCopyWantsStatus] = useState<"idle"|"ok"|"err">("idle");

  async function handleCopyYdk() {
    try {
      await navigator.clipboard.writeText(buildYdk());
      setCopyYdkStatus("ok");
      setTimeout(() => setCopyYdkStatus("idle"), 2000);
    } catch {
      setCopyYdkStatus("err");
      setTimeout(() => setCopyYdkStatus("idle"), 2000);
    }
  }

  async function handleCopyWants() {
    // Collect every unique card across all sections with its deck count
    const allEntries = [...deck.main, ...deck.extra, ...deck.side];
    const countMap = new Map<number, { name: string; count: number }>();
    for (const e of allEntries) {
      const cur = countMap.get(e.id);
      if (cur) cur.count++;
      else countMap.set(e.id, { name: e.name, count: 1 });
    }

    const lines: string[] = [];
    for (const [id, { name, count }] of countMap) {
      const owned   = collectionAmounts[id] ?? 0;
      const missing = Math.max(0, count - owned);
      if (missing > 0) lines.push(`${missing} ${name}`);
    }

    if (lines.length === 0) {
      // Nothing missing — copy an empty list but still flash "ok"
      await navigator.clipboard.writeText("").catch(() => {});
      setCopyWantsStatus("ok");
      setTimeout(() => setCopyWantsStatus("idle"), 2000);
      return;
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyWantsStatus("ok");
      setTimeout(() => setCopyWantsStatus("idle"), 2000);
    } catch {
      setCopyWantsStatus("err");
      setTimeout(() => setCopyWantsStatus("idle"), 2000);
    }
  }

  // ── Deck section renderer ─────────────────────────────────────────────────
  function renderDeckSection(label: string, section: keyof Deck, max: number) {
    const entries = deck[section];
    const grouped = groupSection(entries);
    const isCollapsed = collapsed[section];
    const overLimit = entries.length > max;
    return (
      <div style={{ marginBottom: 12 }}>
        <div
          className="deck-section-header"
          onClick={() => setCollapsed((p) => ({ ...p, [section]: !p[section] }))}
        >
          <span>{label}</span>
          <span style={{ fontSize: 11, color: overLimit ? "#e74c3c" : "rgba(200,150,40,0.5)" }}>
            {entries.length}/{max}
          </span>
          <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 11 }}>{isCollapsed ? "▶" : "▼"}</span>
        </div>
        {!isCollapsed && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 4px" }}>
            {grouped.map(({ entry, count }) => {
              const owned   = collectionAmounts[entry.id] ?? 0;
              const missing = compareMode ? Math.max(0, count - owned) : 0;
              // badge: compare mode → "owned/inDeck", normal → "×N" when >1
              const badgeText = compareMode
                ? `${owned}/${count}`
                : count > 1 ? `×${count}` : null;
              // colour: red when missing any, green when fully covered, gold default
              const badgeColor = compareMode
                ? (missing > 0 ? "#e74c3c" : "#4caf50")
                : "#f0d060";
              return (
                <div
                  key={entry.id}
                  className="deck-card-thumb"
                  title={`${entry.name}${compareMode ? ` — owned: ${owned}, in deck: ${count}` : count > 1 ? ` ×${count}` : ""} — right-click to remove`}
                  onContextMenu={(e) => { e.preventDefault(); removeOneFromSection(entry.id, section); }}
                >
                  <img
                    src={entry.imgPath?.replace("asset://", "/")}
                    width={52}
                    style={{ display: "block", borderRadius: 4, opacity: compareMode && missing > 0 ? 0.65 : 1 }}
                    draggable={false}
                  />
                  {badgeText && (
                    <div className="deck-card-count" style={{ color: badgeColor }}>
                      {badgeText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const BAN_COLORS: Record<string, string> = { forbidden: "#e74c3c", limited: "#f0a500", semi: "#f0d060" };
  const CARD_WIDTH = 140;
  const CARD_HEIGHT = 180;

  const saveLabel = saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Error ✕" : "Save";
  const saveBg    = saveStatus === "saved" ? "rgba(76,175,80,0.2)" : saveStatus === "error" ? "rgba(220,50,50,0.2)" : "transparent";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&display=swap');

        .db-root { display:flex; flex-direction:column; height:100vh; overflow:hidden; box-sizing:border-box; }

        .db-topbar {
          display:flex; align-items:center; gap:12px;
          padding:10px 16px;
          border-bottom:1px solid rgba(212,175,55,0.2);
          background:rgba(255,255,255,0.02);
          flex-shrink:0; flex-wrap:wrap;
        }

        .db-back-btn {
          display:flex; align-items:center; gap:8px;
          padding:7px 16px; background:transparent;
          color:rgba(200,150,40,0.8); border:1px solid rgba(200,150,40,0.3);
          border-radius:2px; cursor:pointer; font-family:'Cinzel',serif;
          font-size:12px; font-weight:600; letter-spacing:0.2em;
          text-transform:uppercase;
          transition:color 0.15s, border-color 0.15s, background 0.15s;
          white-space:nowrap;
        }
        .db-back-btn:hover { color:#f0d060; border-color:rgba(212,175,55,0.6); background:rgba(212,175,55,0.06); }

        .db-topbar-title {
          font-family:'Cinzel',serif; font-size:13px; font-weight:600;
          letter-spacing:0.3em; color:rgba(200,150,40,0.6); text-transform:uppercase;
          white-space:nowrap;
        }

        /* ── Deck management controls ── */
        .deck-controls { display:flex; align-items:center; gap:8px; margin-left:auto; flex-wrap:wrap; }

        .deck-select {
          padding:6px 10px; background:#111; color:#ccc;
          border:1px solid #333; border-radius:2px;
          font-family:'Cinzel',serif; font-size:12px; cursor:pointer;
          max-width:160px;
        }
        .deck-select:focus { outline:none; border-color:rgba(212,175,55,0.4); }

        .deck-name-input {
          padding:6px 10px; background:#111; color:#eee;
          border:1px solid #333; border-radius:2px;
          font-family:'Cinzel',serif; font-size:12px;
          width:160px;
        }
        .deck-name-input:focus { outline:none; border-color:rgba(212,175,55,0.5); }
        .deck-name-input::placeholder { color:#444; }

        .deck-action-btn {
          padding:6px 14px; border-radius:2px; border:1px solid;
          cursor:pointer; font-family:'Cinzel',serif;
          font-size:11px; font-weight:600; letter-spacing:0.15em;
          text-transform:uppercase; transition:all 0.15s; white-space:nowrap;
        }
        .deck-save-btn {
          color:rgba(200,150,40,0.8); border-color:rgba(200,150,40,0.35);
        }
        .deck-save-btn:hover { color:#f0d060; border-color:rgba(212,175,55,0.7); background:rgba(212,175,55,0.08); }

        .deck-delete-btn {
          color:rgba(200,80,80,0.7); border-color:rgba(200,80,80,0.25);
          background:transparent;
        }
        .deck-delete-btn:hover { color:#e05555; border-color:rgba(200,80,80,0.6); background:rgba(200,50,50,0.08); }
        .deck-delete-btn:disabled { opacity:0.3; cursor:default; }

        /* ── Target tabs + search ── */
        .db-topbar-filters { display:flex; align-items:center; gap:8px; }
        .deck-target-tabs { display:flex; gap:4px; }
        .deck-tab {
          padding:5px 12px; border-radius:2px; border:1px solid rgba(200,150,40,0.25);
          background:transparent; color:rgba(200,150,40,0.5); cursor:pointer;
          font-family:'Cinzel',serif; font-size:11px; font-weight:600;
          letter-spacing:0.15em; text-transform:uppercase; transition:all 0.15s;
        }
        .deck-tab.active { background:rgba(212,175,55,0.12); border-color:rgba(212,175,55,0.6); color:#f0d060; }
        .deck-tab:hover:not(.active) { border-color:rgba(212,175,55,0.4); color:rgba(200,150,40,0.75); }

        .ban-format-tabs { display:flex; gap:4px; }
        .ban-tab {
          padding:5px 12px; border-radius:2px; border:1px solid rgba(100,160,220,0.25);
          background:transparent; color:rgba(100,160,220,0.5); cursor:pointer;
          font-family:'Cinzel',serif; font-size:11px; font-weight:600;
          letter-spacing:0.15em; text-transform:uppercase; transition:all 0.15s;
        }
        .ban-tab.active { background:rgba(100,160,220,0.12); border-color:rgba(100,160,220,0.6); color:#8aadee; }
        .ban-tab:hover:not(.active) { border-color:rgba(100,160,220,0.4); color:rgba(100,160,220,0.75); }

        /* ── Deck panel ── */
        .deck-panel {
          flex:2; min-width:0; border:1px solid #333; border-radius:8px;
          overflow:auto; height:100%; box-sizing:border-box;
          padding:12px; background:rgba(0,0,0,0.15);
        }
        .deck-panel.drag-over { border-color:rgba(212,175,55,0.6); background:rgba(212,175,55,0.04); }

        .deck-section-header {
          display:flex; align-items:center; gap:8px;
          padding:6px 4px; cursor:pointer;
          font-family:'Cinzel',serif; font-size:11px; font-weight:600;
          letter-spacing:0.2em; text-transform:uppercase;
          color:rgba(200,150,40,0.7);
          border-bottom:1px solid rgba(212,175,55,0.15);
          user-select:none;
        }
        .deck-section-header:hover { color:rgba(200,150,40,0.95); }

        .deck-card-thumb {
          position:relative; cursor:context-menu; border-radius:4px;
          border:1px solid transparent; transition:border-color 0.12s, opacity 0.12s; line-height:0;
        }
        .deck-card-thumb:hover { border-color:rgba(220,80,80,0.7); opacity:0.82; }

        .deck-card-count {
          position:absolute; bottom:2px; right:2px;
          background:rgba(0,0,0,0.78); color:#f0d060;
          font-size:10px; font-weight:bold; padding:1px 4px;
          border-radius:3px; line-height:1.4;
        }

        /* ── Grid card ── */
        .grid-card {
          position:relative; cursor:pointer; border-radius:8px;
          transition:border-color 0.15s ease; line-height:0; user-select:none;
        }
        .grid-card:active { opacity:0.85; }

        .ban-dot {
          position:absolute; top:4px; right:4px;
          width:9px; height:9px; border-radius:50%;
          border:1px solid rgba(0,0,0,0.5);
        }
        .deck-in-use {
          position:absolute; top:4px; left:4px;
          background:rgba(0,0,0,0.72); color:#f0d060;
          font-size:10px; font-weight:bold;
          padding:1px 5px; border-radius:3px; line-height:1.5;
        }

        /* ── Deck panel footer ── */
        .deck-panel-footer {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 4px 4px;
          border-top: 1px solid rgba(212,175,55,0.12);
          margin-top: 8px;
        }

        .deck-panel-footer-row {
          display: flex;
          gap: 6px;
        }

        .dp-btn {
          flex: 1;
          padding: 6px 8px;
          border-radius: 2px;
          border: 1px solid;
          cursor: pointer;
          font-size: 10px;
          font-family: 'Cinzel', serif;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: all 0.15s;
          text-align: center;
          white-space: nowrap;
        }
        .dp-btn-compare {
          color: rgba(100,160,220,0.7);
          border-color: rgba(100,160,220,0.25);
          background: transparent;
        }
        .dp-btn-compare:hover        { color:#8aadee; border-color:rgba(100,160,220,0.55); background:rgba(100,160,220,0.07); }
        .dp-btn-compare.active       { color:#8aadee; border-color:rgba(100,160,220,0.6); background:rgba(100,160,220,0.12); }

        .dp-btn-copy {
          color: rgba(200,150,40,0.65);
          border-color: rgba(200,150,40,0.2);
          background: transparent;
        }
        .dp-btn-copy:hover  { color:#f0d060; border-color:rgba(212,175,55,0.55); background:rgba(212,175,55,0.07); }
        .dp-btn-copy.ok     { color:#4caf50; border-color:rgba(76,175,80,0.5);   background:rgba(76,175,80,0.08); }
        .dp-btn-copy.err    { color:#e74c3c; border-color:rgba(231,76,60,0.5);   background:rgba(231,76,60,0.08); }
      `}</style>

      <div className="db-root">

        {/* ── TOP BAR ── */}
        <div className="db-topbar">
          <button className="db-back-btn" onClick={onBack}>← Main Menu</button>
          <span className="db-topbar-title">Deck Builder</span>

          {/* Deck management: dropdown → name → save → delete */}
          <div className="deck-controls">
            <select
              className="deck-select"
              value=""
              onChange={(e) => { if (e.target.value) handleLoad(e.target.value); }}
            >
              <option value="" disabled>Load deck…</option>
              {deckList.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>

            <input
              className="deck-name-input"
              type="text"
              placeholder="Deck name…"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />

            <button
              className="deck-action-btn deck-save-btn"
              style={{ background: saveBg }}
              onClick={handleSave}
              disabled={!deckName.trim()}
            >
              {saveLabel}
            </button>

            <button
              className="deck-action-btn deck-delete-btn"
              onClick={handleDelete}
              disabled={!deckName.trim() || !deckList.includes(deckName.trim())}
            >
              Delete
            </button>
          </div>

          {/* Target tabs + ban format + search — pushed to the far right */}
          <div className="db-topbar-filters">
            <div className="ban-format-tabs">
              {(["tcg", "ocg", "goat"] as const).map((fmt) => (
                <button
                  key={fmt}
                  className={`ban-tab ${banFormat === fmt ? "active" : ""}`}
                  onClick={() => setBanFormat(fmt)}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="deck-target-tabs">
              <button className={`deck-tab ${deckTarget === "main" ? "active" : ""}`} onClick={() => setDeckTarget("main")}>Main</button>
              <button className={`deck-tab ${deckTarget === "side" ? "active" : ""}`} onClick={() => setDeckTarget("side")}>Side</button>
            </div>
            <input
              type="text"
              placeholder="Search name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        {/* ── FILTER BAR ── */}
        <CardFiltersBar
          filters={filters}
          onChange={(f) => setFilters(f)}
          resultCount={cards.length}
          loading={cardLoading}
        />

        {/* ── MAIN CONTENT ── */}
        <div style={{ display:"flex", flexDirection:"row", gap:20, padding:"16px 20px", flex:1, minHeight:0 }}>

          {/* LEFT: CARD DETAIL */}
          <div style={{
            flex:2, minWidth:0, padding:20,
            border:"1px solid #333", borderRadius:8,
            overflow:"auto", height:"100%", boxSizing:"border-box",
          }}>
            {!selectedCard && !detailLoading && <p style={{ color:"#555" }}>Select a card</p>}
            {detailLoading && <p style={{ color:"#555" }}>Loading…</p>}
            {selectedCard && !detailLoading && (
              <>
                <div style={{
                  background: getFrameBackground(selectedCard.frameType),
                  padding:"10px 15px", borderRadius:6,
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  marginBottom:15,
                }}>
                  <h2 style={{ margin:0 }}>{selectedCard.name}</h2>
                  {selectedCard.attribute && (
                    <img src={`/icons/attributes/${selectedCard.attribute}.png`} style={{ height:28 }} alt={selectedCard.attribute} />
                  )}
                </div>
                <div style={{ display:"flex", gap:20 }}>
                  <img src={selectedCard.imgPath?.replace("asset://", "/")} width={250} alt={selectedCard.name} />
                  {renderStats(selectedCard)}
                </div>
                <div style={{ marginTop:15, padding:8, borderRadius:4, background:detailFrameBg, textAlign:"center", fontWeight:"bold" }}>
                  {detailTypeline}
                </div>
                <div style={{ marginTop:15, whiteSpace:"pre-wrap" }}>{selectedCard.desc}</div>
              </>
            )}
          </div>

          {/* MIDDLE: CARD GRID */}
          <div ref={gridRef} style={{ flex:3, minWidth:0, height:"100%", overflow:"hidden" }}>
            {gridWidth > 0 && (() => {
              const colCount = Math.max(1, Math.floor(gridWidth / CARD_WIDTH));
              const rowCount = Math.ceil(cards.length / colCount);
              return (
                <List
                  style={{ height:"100%", width:gridWidth }}
                  rowCount={rowCount}
                  rowHeight={CARD_HEIGHT}
                  rowProps={{} as never}
                  rowComponent={({ index, style }: { index:number; style:React.CSSProperties }) => {
                    const start = index * colCount;
                    const rowCards = cards.slice(start, start + colCount);
                    return (
                      <div style={{ ...style, display:"flex", gap:10, padding:5 }}>
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
                                border:`2px solid ${isSelected ? "#4caf50" : atLimit ? "#555" : "#444"}`,
                                opacity: atLimit && inDeck > 0 ? 0.55 : 1,
                              }}
                              draggable
                              onDragStart={() => handleDragStart(c)}
                              onDragEnd={handleDragEnd}
                              onClick={() => { handleCardClick(c); addToDeck(c); }}
                              onContextMenu={(e) => { e.preventDefault(); removeFromDeckAny(c.id); }}
                            >
                              <img
                                src={c.imgPath?.replace("asset://", "/")}
                                width={120} loading="lazy"
                                style={{ display:"block", borderRadius:6 }}
                                draggable={false}
                              />
                              {ban && <div className="ban-dot" style={{ background:BAN_COLORS[ban] }} title={ban} />}
                              {inDeck > 0 && <div className="deck-in-use">{inDeck}/{max}</div>}
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
            {renderDeckSection("Main Deck",  "main",  60)}
            {renderDeckSection("Extra Deck", "extra", 15)}
            {renderDeckSection("Side Deck",  "side",  15)}

            {/* ── Panel footer ── */}
            <div className="deck-panel-footer">
              {/* Compare toggle — full width */}
              <button
                className={`dp-btn dp-btn-compare ${compareMode ? "active" : ""}`}
                onClick={() => setCompareMode((v) => !v)}
              >
                {compareMode ? "◉ Collection Compare" : "○ Collection Compare"}
              </button>

              {/* Copy row */}
              <div className="deck-panel-footer-row">
                <button
                  className={`dp-btn dp-btn-copy ${copyYdkStatus === "ok" ? "ok" : copyYdkStatus === "err" ? "err" : ""}`}
                  onClick={handleCopyYdk}
                  disabled={deck.main.length + deck.extra.length + deck.side.length === 0}
                >
                  {copyYdkStatus === "ok" ? "Copied ✓" : copyYdkStatus === "err" ? "Failed ✕" : "Copy .ydk"}
                </button>
                <button
                  className={`dp-btn dp-btn-copy ${copyWantsStatus === "ok" ? "ok" : copyWantsStatus === "err" ? "err" : ""}`}
                  onClick={handleCopyWants}
                  disabled={deck.main.length + deck.extra.length + deck.side.length === 0}
                >
                  {copyWantsStatus === "ok" ? "Copied ✓" : copyWantsStatus === "err" ? "Failed ✕" : "Wants List"}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
