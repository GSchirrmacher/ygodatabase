import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types (mirror Rust structs)
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

interface AltArtEditorProps {
  onSelectCard?: (cardId: number, artworkIndex: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AltArtEditor({ onSelectCard }: AltArtEditorProps) {
  const [cards, setCards] = useState<AltArtCard[]>([]);
  const [selected, setSelected] = useState<AltArtCard | null>(null);
  const [previewArtwork, setPreviewArtwork] = useState<number>(0);
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok">("idle");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    invoke<AltArtCard[]>("get_alt_art_cards").then(setCards).catch(console.error);
  }, []);

  const selectCard = useCallback((card: AltArtCard) => {
    setSelected(card);
    setPreviewArtwork(0);
    onSelectCard?.(card.id, 0);
  }, [onSelectCard]);

  async function handleSetArtwork(setCode: string, artwork: number) {
    if (!selected) return;
    setSaving(true);
    try {
      await invoke("set_set_artwork", { cardId: selected.id, setCode, artwork });
      // Update local state
      setSelected((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          setEntries: prev.setEntries.map((e) =>
            e.setCode === setCode ? { ...e, artwork } : e
          ),
        };
      });
    } finally {
      setSaving(false);
    }
  }

  function buildCardmarketUrl(name: string) {
    // Replace spaces with hyphens, remove special chars that break the URL
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

  return (
    <>
      <style>{`
        .aae-root {
          display: flex;
          height: 100%;
          gap: 0;
          overflow: hidden;
        }

        /* ── Card list sidebar ── */
        .aae-sidebar {
          width: 200px;
          flex-shrink: 0;
          border-right: 1px solid rgba(212,175,55,0.15);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .aae-search {
          padding: 8px;
          background: #111;
          border: none;
          border-bottom: 1px solid rgba(212,175,55,0.12);
          color: #ccc;
          font-size: 12px;
          outline: none;
          width: 100%;
          box-sizing: border-box;
        }
        .aae-search::placeholder { color: #444; }
        .aae-list {
          flex: 1;
          overflow-y: auto;
        }
        .aae-list-item {
          padding: 7px 12px;
          cursor: pointer;
          font-size: 12px;
          color: #aaa;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.1s, color 0.1s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .aae-list-item:hover { background: rgba(212,175,55,0.06); color: #ccc; }
        .aae-list-item.active { background: rgba(212,175,55,0.1); color: #f0d060; }

        /* ── Editor panel ── */
        .aae-editor {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .aae-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .aae-card-name {
          font-size: 16px;
          font-weight: 600;
          color: #f0d060;
          font-family: 'Cinzel', serif;
        }
        .aae-cm-btn {
          padding: 4px 12px;
          background: transparent;
          color: rgba(100,160,220,0.8);
          border: 1px solid rgba(100,160,220,0.3);
          border-radius: 3px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .aae-cm-btn:hover { color: #8aadee; border-color: rgba(100,160,220,0.6); background: rgba(100,160,220,0.07); }
        .aae-cm-btn.ok { color: #4caf50; border-color: rgba(76,175,80,0.5); }

        /* Artwork switcher */
        .aae-artworks {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .aae-art-thumb {
          cursor: pointer;
          border-radius: 6px;
          border: 2px solid transparent;
          transition: border-color 0.15s, opacity 0.15s;
          line-height: 0;
          opacity: 0.6;
        }
        .aae-art-thumb:hover { opacity: 0.85; }
        .aae-art-thumb.active { border-color: #f0d060; opacity: 1; }

        /* Preview image */
        .aae-preview {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }

        /* Set table */
        .aae-sets {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .aae-set-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: rgba(255,255,255,0.03);
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.06);
          flex-wrap: wrap;
        }
        .aae-set-code {
          font-size: 11px;
          color: #888;
          font-family: monospace;
          min-width: 100px;
        }
        .aae-set-name {
          font-size: 12px;
          color: #aaa;
          flex: 1;
        }
        .aae-art-btns {
          display: flex;
          gap: 4px;
        }
        .aae-art-btn {
          padding: 3px 8px;
          border-radius: 3px;
          border: 1px solid rgba(200,150,40,0.2);
          background: transparent;
          color: rgba(200,150,40,0.5);
          font-size: 10px;
          cursor: pointer;
          transition: all 0.12s;
        }
        .aae-art-btn:hover { color: #f0d060; border-color: rgba(212,175,55,0.5); background: rgba(212,175,55,0.07); }
        .aae-art-btn.active { color: #f0d060; border-color: rgba(212,175,55,0.6); background: rgba(212,175,55,0.12); }

        .aae-saving { font-size: 11px; color: rgba(200,150,40,0.5); }
        .aae-empty { color: #555; padding: 40px; text-align: center; }
      `}</style>

      <div className="aae-root">
        {/* Sidebar: card list */}
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

        {/* Editor */}
        <div className="aae-editor">
          {!selected && (
            <p className="aae-empty">Select a card from the list to edit its artwork assignments.</p>
          )}

          {selected && (
            <>
              {/* Title + Cardmarket link */}
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
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: "rgba(100,160,220,0.7)", textDecoration: "none" }}
                >
                  ↗ Open
                </a>
                {saving && <span className="aae-saving">Saving…</span>}
              </div>

              {/* Artwork thumbnails — click to preview */}
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
                      title={`Artwork ${art.artworkIndex} (image_id: ${art.imageId})`}
                    >
                      <img
                        src={(art.imgThumbPath ?? art.imgPath).replace("asset://", "/")}
                        onError={(e) => { (e.target as HTMLImageElement).src = art.imgPath.replace("asset://", "/"); }}
                        width={64}
                        style={{ display: "block", borderRadius: 4 }}
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview of selected artwork */}
              {previewVariant && (
                <div className="aae-preview">
                  <img
                    src={previewVariant.imgPath.replace("asset://", "/")}
                    width={200}
                    style={{ borderRadius: 8, border: "1px solid rgba(212,175,55,0.2)" }}
                    alt={`${selected.name} artwork ${previewArtwork}`}
                  />
                  <div style={{ fontSize: 12, color: "#777", paddingTop: 8 }}>
                    <div>Artwork index: <strong style={{ color: "#f0d060" }}>{previewArtwork}</strong></div>
                    <div>Image ID: <strong style={{ color: "#f0d060" }}>{previewVariant.imageId}</strong></div>
                  </div>
                </div>
              )}

              {/* Set entries — assign artwork per set */}
              <div>
                <div style={{ fontSize: 11, color: "rgba(200,150,40,0.45)", marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Assign Artwork per Set
                </div>
                <div className="aae-sets">
                  {selected.setEntries.map((entry) => (
                    <div key={entry.setCode} className="aae-set-row">
                      <span className="aae-set-code">{entry.setCode}</span>
                      <span className="aae-set-name">{entry.setName ?? "—"}</span>
                      {entry.setRarity && (
                        <span style={{ fontSize: 11, color: "#666" }}>{entry.setRarity}</span>
                      )}
                      <div className="aae-art-btns">
                        {selected.artworks.map((art) => (
                          <button
                            key={art.artworkIndex}
                            className={`aae-art-btn ${entry.artwork === art.artworkIndex ? "active" : ""}`}
                            onClick={() => handleSetArtwork(entry.setCode, art.artworkIndex)}
                            title={`Assign artwork ${art.artworkIndex} to ${entry.setCode}`}
                          >
                            {art.artworkIndex === 0 ? "Base" : `Alt ${art.artworkIndex}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}