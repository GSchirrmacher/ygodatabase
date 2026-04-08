import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getRarityGroup } from "../utils/cardUtils";
import { rarityGroupIcons } from "../constants/rarity";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ArtworkVariant {
  artworkIndex: number;
  imageId: number;
  imgPath: string;
  imgThumbPath?: string;
}

interface AltArtSetEntry {
  setCode: string;
  setName?: string;
  setRarity?: string;
  artwork: number;
}

interface AltArtCard {
  id: number;
  name: string;
  artworks: ArtworkVariant[];
  setEntries: AltArtSetEntry[];
}

interface SetGroup {
  setCode: string;
  setName: string;
}

interface AltArtEditorProps {
  onSelectCard?: (cardId: number, artworkIndex: number) => void;
}

const COMMON_RARITIES = [
  "Common", "Rare", "Super Rare", "Ultra Rare", "Secret Rare",
  "Ultimate Rare", "Ghost Rare", "Starlight Rare", "Quarter Century Secret Rare",
  "Collector's Rare", "Gold Rare", "Gold Secret Rare", "Platinum Rare",
  "Platinum Secret Rare", "Premium Gold Rare", "Prismatic Secret Rare",
  "Shatterfoil Rare", "Starfoil Rare", "Mosaic Rare",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AltArtEditor({ onSelectCard }: AltArtEditorProps) {
  const [cards, setCards]           = useState<AltArtCard[]>([]);
  const [selected, setSelected]     = useState<AltArtCard | null>(null);
  const [previewArtwork, setPreviewArtwork] = useState<number>(0);
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok">("idle");
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState("");

  // Per set-group: which artwork tab is active (default 0)
  const [setArtworkTab, setSetArtworkTab] = useState<Record<string, number>>({});

  // Per set-group: whether add-rarity form is open
  const [addingFor, setAddingFor]   = useState<string | null>(null);
  const [newRarity, setNewRarity]   = useState("");
  const [customRarity, setCustomRarity] = useState("");

  const loadCards = useCallback(() => {
    invoke<AltArtCard[]>("get_alt_art_cards").then((data) => {
      setCards(data);
      setSelected((prev) => prev ? (data.find((c) => c.id === prev.id) ?? null) : null);
    }).catch(console.error);
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  const selectCard = useCallback((card: AltArtCard) => {
    setSelected(card);
    setPreviewArtwork(0);
    setSetArtworkTab({});
    setAddingFor(null);
    onSelectCard?.(card.id, 0);
  }, [onSelectCard]);

  // All distinct set groups (one per set_code)
  function getSetGroups(entries: AltArtSetEntry[]): SetGroup[] {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (!seen.has(e.setCode)) seen.set(e.setCode, e.setName ?? e.setCode);
    }
    return Array.from(seen.entries()).map(([setCode, setName]) => ({ setCode, setName }));
  }

  // Entries for a given (setCode, artworkIndex)
  function entriesFor(setCode: string, artworkIndex: number): AltArtSetEntry[] {
    return (selected?.setEntries ?? []).filter(
      (e) => e.setCode === setCode && e.artwork === artworkIndex
    );
  }

  // How many artworks exist for a set (= how many distinct artwork values are assigned)
  function artworkTabsFor(setCode: string): number[] {
    const indexes = new Set<number>(
      (selected?.setEntries ?? [])
        .filter((e) => e.setCode === setCode)
        .map((e) => e.artwork)
    );
    // Always include all artwork indexes the card has (even if unassigned to this set yet)
    for (const art of selected?.artworks ?? []) indexes.add(art.artworkIndex);
    return Array.from(indexes).sort((a, b) => a - b);
  }

  async function handleRemoveEntry(setCode: string, setRarity: string, artwork: number) {
    if (!selected) return;
    const confirmed = window.confirm(`Remove "${setRarity}" (${artwork === 0 ? "Base" : `Alt ${artwork}`}) from ${setCode}?`);
    if (!confirmed) return;
    setSaving(true);
    try {
      await invoke("remove_set_entry", { cardId: selected.id, setCode, setRarity, artwork });
      loadCards();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRarity(setCode: string, setName: string) {
    if (!selected) return;
    const rarity = newRarity === "__custom" ? customRarity.trim() : newRarity;
    if (!rarity) return;
    const artworkIndex = setArtworkTab[setCode] ?? 0;
    setSaving(true);
    try {
      await invoke("add_set_entry", {
        cardId: selected.id,
        setCode,
        setName,
        setRarity: rarity,
        artwork: artworkIndex,
      });
      setAddingFor(null);
      setNewRarity("");
      setCustomRarity("");
      loadCards();
    } catch (err: any) {
      alert(err?.toString() ?? "Failed to add entry");
    } finally {
      setSaving(false);
    }
  }

  function buildCardmarketUrl(name: string) {
    const slug = name
      .replace(/['']/g, "")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return `https://www.cardmarket.com/en/YuGiOh/Cards/${slug}/Versions`;
  }

  async function handleCopyLink() {
    if (!selected) return;
    await navigator.clipboard.writeText(buildCardmarketUrl(selected.name)).catch(() => {});
    setCopyStatus("ok");
    setTimeout(() => setCopyStatus("idle"), 2000);
  }

  const filtered = search.trim()
    ? cards.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : cards;

  const previewVariant = selected?.artworks.find((a) => a.artworkIndex === previewArtwork)
    ?? selected?.artworks[0];

  const setGroups = selected ? getSetGroups(selected.setEntries) : [];

  return (
    <>
      <style>{`
        .aae-root { display:flex; height:100%; overflow:hidden; }

        /* Sidebar */
        .aae-sidebar {
          width:200px; flex-shrink:0;
          border-right:1px solid rgba(212,175,55,0.15);
          display:flex; flex-direction:column; overflow:hidden;
        }
        .aae-search {
          padding:8px; background:#111; border:none;
          border-bottom:1px solid rgba(212,175,55,0.12);
          color:#ccc; font-size:12px; outline:none;
          width:100%; box-sizing:border-box;
        }
        .aae-search::placeholder { color:#444; }
        .aae-list { flex:1; overflow-y:auto; }
        .aae-list-item {
          padding:7px 12px; cursor:pointer; font-size:12px; color:#aaa;
          border-bottom:1px solid rgba(255,255,255,0.04);
          transition:background 0.1s, color 0.1s;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .aae-list-item:hover  { background:rgba(212,175,55,0.06); color:#ccc; }
        .aae-list-item.active { background:rgba(212,175,55,0.1);  color:#f0d060; }

        /* Editor */
        .aae-editor {
          flex:1; overflow-y:auto; padding:16px 20px;
          display:flex; flex-direction:column; gap:16px;
        }
        .aae-empty { color:#555; padding:40px; text-align:center; }

        /* Title row */
        .aae-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .aae-card-name { font-size:16px; font-weight:600; color:#f0d060; font-family:'Cinzel',serif; }
        .aae-cm-btn {
          padding:4px 12px; background:transparent;
          color:rgba(100,160,220,0.8); border:1px solid rgba(100,160,220,0.3);
          border-radius:3px; font-size:11px; cursor:pointer; transition:all 0.15s;
        }
        .aae-cm-btn:hover { color:#8aadee; border-color:rgba(100,160,220,0.6); background:rgba(100,160,220,0.07); }
        .aae-cm-btn.ok    { color:#4caf50; border-color:rgba(76,175,80,0.5); }
        .aae-saving { font-size:11px; color:rgba(200,150,40,0.5); }

        /* Artwork thumbnails (global preview strip) */
        .aae-artworks { display:flex; gap:8px; flex-wrap:wrap; }
        .aae-art-thumb {
          cursor:pointer; border-radius:6px; border:2px solid transparent;
          transition:border-color 0.15s, opacity 0.15s;
          line-height:0; opacity:0.55; position:relative;
        }
        .aae-art-thumb:hover  { opacity:0.82; }
        .aae-art-thumb.active { border-color:#f0d060; opacity:1; }
        .aae-art-label {
          position:absolute; bottom:2px; left:50%; transform:translateX(-50%);
          background:rgba(0,0,0,0.78); color:#f0d060;
          font-size:9px; font-weight:bold; padding:1px 5px; border-radius:2px;
          white-space:nowrap; pointer-events:none;
        }

        /* Large preview */
        .aae-preview { display:flex; gap:16px; align-items:flex-start; }

        /* Set groups */
        .aae-sets { display:flex; flex-direction:column; gap:10px; }
        .aae-set-group {
          border:1px solid rgba(255,255,255,0.08);
          border-radius:6px; overflow:hidden;
        }

        /* Set header */
        .aae-set-header {
          display:flex; align-items:center; gap:8px;
          padding:7px 12px; background:rgba(255,255,255,0.035);
          border-bottom:1px solid rgba(255,255,255,0.06);
        }
        .aae-set-code { font-size:11px; color:#777; font-family:monospace; min-width:90px; }
        .aae-set-name { font-size:12px; color:#999; flex:1; }

        /* Artwork tabs (Base / Alt 1 / Alt 2 …) */
        .aae-art-tabs { display:flex; gap:6px; padding:8px 12px 0; }
        .aae-art-tab {
          display:flex; align-items:center; gap:5px;
          padding:4px 10px; border-radius:4px 4px 0 0;
          border:1px solid rgba(255,255,255,0.1); border-bottom:none;
          background:rgba(255,255,255,0.02);
          cursor:pointer; font-size:11px; color:#777; transition:all 0.12s;
        }
        .aae-art-tab:hover  { color:#aaa; background:rgba(255,255,255,0.05); }
        .aae-art-tab.active {
          border-color:rgba(212,175,55,0.4); border-bottom:1px solid rgba(212,175,55,0.15);
          background:rgba(212,175,55,0.08); color:#f0d060;
        }
        .aae-art-tab img {
          width:28px; border-radius:3px; display:block;
        }

        /* Rarity chips + add button */
        .aae-rarities-area {
          padding:10px 12px;
          border-top:1px solid rgba(212,175,55,0.1);
          display:flex; flex-direction:column; gap:8px;
        }
        .aae-chips { display:flex; flex-wrap:wrap; gap:6px; }
        .aae-chip {
          display:flex; align-items:center; gap:5px;
          padding:4px 8px; border-radius:4px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.1);
          font-size:11px; color:#aaa;
        }
        .aae-chip img { width:16px; height:16px; object-fit:contain; }
        .aae-chip-remove {
          background:none; border:none; cursor:pointer;
          color:rgba(200,80,80,0.5); font-size:13px; line-height:1;
          padding:0 2px; transition:color 0.12s;
        }
        .aae-chip-remove:hover { color:#e05555; }
        .aae-no-rarities { font-size:11px; color:#555; font-style:italic; }

        /* Add rarity form */
        .aae-add-btn {
          align-self:flex-start;
          padding:3px 10px; background:transparent;
          border:1px solid rgba(100,200,100,0.25); color:rgba(100,200,100,0.6);
          border-radius:3px; font-size:11px; cursor:pointer; transition:all 0.12s;
        }
        .aae-add-btn:hover { border-color:rgba(100,200,100,0.5); color:#4caf50; background:rgba(76,175,80,0.07); }
        .aae-add-form {
          display:flex; align-items:center; gap:6px; flex-wrap:wrap;
        }
        .aae-add-form select, .aae-add-form input {
          padding:4px 8px; background:#111; color:#ccc;
          border:1px solid #2a2a2a; border-radius:2px; font-size:11px;
        }
        .aae-add-form input { width:150px; }
        .aae-btn-confirm {
          padding:3px 10px; background:rgba(76,175,80,0.12);
          border:1px solid rgba(76,175,80,0.4); color:#4caf50;
          border-radius:2px; font-size:11px; cursor:pointer;
          transition:all 0.12s;
        }
        .aae-btn-confirm:hover { background:rgba(76,175,80,0.2); }
        .aae-btn-confirm:disabled { opacity:0.35; cursor:default; }
        .aae-btn-cancel {
          padding:3px 10px; background:transparent;
          border:1px solid rgba(200,80,80,0.3); color:rgba(200,80,80,0.7);
          border-radius:2px; font-size:11px; cursor:pointer;
        }
      `}</style>

      <div className="aae-root">
        {/* ── Sidebar ── */}
        <div className="aae-sidebar">
          <input
            className="aae-search"
            placeholder="Filter cards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="aae-list">
            {filtered.map((card) => (
              <div
                key={card.id}
                className={`aae-list-item ${selected?.id === card.id ? "active" : ""}`}
                onClick={() => selectCard(card)}
                title={`${card.artworks.length} artworks`}
              >
                {card.name}
              </div>
            ))}
          </div>
        </div>

        {/* ── Editor ── */}
        <div className="aae-editor">
          {!selected && <p className="aae-empty">Select a card from the list.</p>}

          {selected && (
            <>
              {/* Title + Cardmarket */}
              <div className="aae-title-row">
                <span className="aae-card-name">{selected.name}</span>
                <button
                  className={`aae-cm-btn ${copyStatus === "ok" ? "ok" : ""}`}
                  onClick={handleCopyLink}
                >
                  {copyStatus === "ok" ? "Copied ✓" : "Copy Cardmarket Link"}
                </button>
                <a
                  href={buildCardmarketUrl(selected.name)}
                  target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: "rgba(100,160,220,0.7)", textDecoration: "none" }}
                >↗ Open</a>
                {saving && <span className="aae-saving">Saving…</span>}
              </div>

              {/* Global artwork strip — click to preview */}
              <div>
                <div style={{ fontSize: 11, color: "rgba(200,150,40,0.45)", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Artworks ({selected.artworks.length})
                </div>
                <div className="aae-artworks">
                  {selected.artworks.map((art) => (
                    <div
                      key={art.artworkIndex}
                      className={`aae-art-thumb ${previewArtwork === art.artworkIndex ? "active" : ""}`}
                      onClick={() => { setPreviewArtwork(art.artworkIndex); onSelectCard?.(selected.id, art.artworkIndex); }}
                    >
                      <img
                        src={(art.imgThumbPath ?? art.imgPath).replace("asset://", "/")}
                        onError={(e) => { (e.target as HTMLImageElement).src = art.imgPath.replace("asset://", "/"); }}
                        width={64}
                        style={{ display: "block", borderRadius: 4 }}
                        draggable={false}
                      />
                      <div className="aae-art-label">
                        {art.artworkIndex === 0 ? "Base" : `Alt ${art.artworkIndex}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Large preview */}
              {previewVariant && (
                <div className="aae-preview">
                  <img
                    src={previewVariant.imgPath.replace("asset://", "/")}
                    width={175}
                    style={{ borderRadius: 8, border: "1px solid rgba(212,175,55,0.2)" }}
                    alt={`${selected.name} artwork ${previewArtwork}`}
                  />
                  <div style={{ fontSize: 12, color: "#777", paddingTop: 6 }}>
                    <div>Index: <strong style={{ color: "#f0d060" }}>{previewArtwork}</strong></div>
                    <div>Image ID: <strong style={{ color: "#f0d060" }}>{previewVariant.imageId}</strong></div>
                  </div>
                </div>
              )}

              {/* Per-set groups */}
              <div>
                <div style={{ fontSize: 11, color: "rgba(200,150,40,0.45)", marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Set Assignments
                </div>
                <div className="aae-sets">
                  {setGroups.map((group) => {
                    const tabs         = artworkTabsFor(group.setCode);
                    const activeTab    = setArtworkTab[group.setCode] ?? 0;
                    const rarities     = entriesFor(group.setCode, activeTab);
                    const isAdding     = addingFor === group.setCode;
                    const activeArt    = selected.artworks.find((a) => a.artworkIndex === activeTab);

                    return (
                      <div key={group.setCode} className="aae-set-group">
                        {/* Header */}
                        <div className="aae-set-header">
                          <span className="aae-set-code">{group.setCode}</span>
                          <span className="aae-set-name">{group.setName}</span>
                        </div>

                        {/* Artwork tabs — one per artwork index */}
                        <div className="aae-art-tabs">
                          {tabs.map((idx) => {
                            const art = selected.artworks.find((a) => a.artworkIndex === idx);
                            const count = entriesFor(group.setCode, idx).length;
                            return (
                              <div
                                key={idx}
                                className={`aae-art-tab ${activeTab === idx ? "active" : ""}`}
                                onClick={() => setSetArtworkTab((p) => ({ ...p, [group.setCode]: idx }))}
                                title={`${idx === 0 ? "Base" : `Alt ${idx}`} — ${count} rarity${count !== 1 ? "s" : ""}`}
                              >
                                {art && (
                                  <img
                                    src={(art.imgThumbPath ?? art.imgPath).replace("asset://", "/")}
                                    onError={(e) => { (e.target as HTMLImageElement).src = art.imgPath.replace("asset://", "/"); }}
                                    alt=""
                                  />
                                )}
                                <span>{idx === 0 ? "Base" : `Alt ${idx}`}</span>
                                {count > 0 && (
                                  <span style={{ fontSize: 10, opacity: 0.5 }}>({count})</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Rarities for active artwork tab */}
                        <div className="aae-rarities-area">
                          <div className="aae-chips">
                            {rarities.length === 0 && (
                              <span className="aae-no-rarities">No rarities assigned to this artwork yet</span>
                            )}
                            {rarities.map((entry) => {
                              const rarityGroup = getRarityGroup(entry.setRarity);
                              const icon = rarityGroupIcons[rarityGroup];
                              return (
                                <div key={entry.setRarity ?? "?"} className="aae-chip">
                                  {icon && (
                                    <img
                                      src={icon}
                                      alt={entry.setRarity ?? ""}
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                  )}
                                  <span>{entry.setRarity ?? "Unknown"}</span>
                                  <button
                                    className="aae-chip-remove"
                                    title={`Remove ${entry.setRarity} (${activeTab === 0 ? "Base" : `Alt ${activeTab}`}) from ${group.setCode}`}
                                    onClick={() => handleRemoveEntry(group.setCode, entry.setRarity ?? "", activeTab)}
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          {/* Add rarity button / form */}
                          {!isAdding && (
                            <button
                              className="aae-add-btn"
                              onClick={() => {
                                setAddingFor(group.setCode);
                                setNewRarity("");
                                setCustomRarity("");
                              }}
                            >
                              + Add Rarity to {activeTab === 0 ? "Base" : `Alt ${activeTab}`}
                            </button>
                          )}

                          {isAdding && (
                            <div className="aae-add-form">
                              <select
                                value={newRarity}
                                onChange={(e) => setNewRarity(e.target.value)}
                              >
                                <option value="">— pick rarity —</option>
                                {COMMON_RARITIES.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                                <option value="__custom">Custom…</option>
                              </select>
                              {newRarity === "__custom" && (
                                <input
                                  placeholder="Type rarity…"
                                  value={customRarity}
                                  onChange={(e) => setCustomRarity(e.target.value)}
                                />
                              )}
                              <button
                                className="aae-btn-confirm"
                                disabled={!newRarity || newRarity === "__custom" ? !customRarity.trim() : false}
                                onClick={() => handleAddRarity(group.setCode, group.setName)}
                              >
                                Add
                              </button>
                              <button
                                className="aae-btn-cancel"
                                onClick={() => setAddingFor(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}