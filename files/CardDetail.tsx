import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CardDetail, CardSet, CardSetRarity } from "../types/cards";
import { getFrameBackground, formatTypeline, getRarityGroup } from "../utils/cardUtils";
import { rarityGroupIcons } from "../constants/rarity";

interface CardDetailPanelProps {
  card: CardDetail | null;
  loading: boolean;
  onCollectionUpdate: (cardId: number, setCode: string | undefined, rarity: string | undefined, newValue: number) => void;
}

export default function CardDetailPanel({ card, loading, onCollectionUpdate }: CardDetailPanelProps) {
  const frameBackground = useMemo(
    () => getFrameBackground(card?.frameType),
    [card?.frameType]
  );
  const typeline = useMemo(
    () => (card ? formatTypeline(card) : ""),
    [card]
  );

  async function handleCollectionChange(
    e: React.MouseEvent,
    row: { id: number; setCode?: string; rarity?: string; collectionAmount?: number },
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
        amount: newValue,
      });
      onCollectionUpdate(row.id, row.setCode, row.rarity, newValue);
    } catch (err) {
      console.error("Failed to update collection amount:", err);
    }
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

  function renderStats(c: CardDetail) {
    const type = c.frameType;
    if (!type) return null;
    const isPendulum = type.includes("_pendulum");
    const baseType = type.replace("_pendulum", "");
    const rows: React.ReactNode[] = [];

    if (["normal", "effect", "fusion", "synchro", "ritual"].includes(baseType)) {
      rows.push(statRow("Level", c.level, "Level.png"));
      rows.push(statRow("ATK", c.atk));
      rows.push(statRow("DEF", c.def));
      rows.push(statRow("Type", c.race, `types/${c.race}.png`));
    }
    if (baseType === "xyz") {
      rows.push(statRow("Rank", c.level, "Rank.png"));
      rows.push(statRow("ATK", c.atk));
      rows.push(statRow("DEF", c.def));
      rows.push(statRow("Type", c.race, `types/${c.race}.png`));
    }
    if (baseType === "link") {
      rows.push(statRow("L", c.linkval));
      rows.push(statRow("ATK", c.atk));
      rows.push(statRow("Type", c.race, `types/${c.race}.png`));
    }
    if (["spell", "trap"].includes(baseType)) {
      rows.push(statRow("Type", c.race, `types/${c.race}.png`));
    }
    if (isPendulum) {
      rows.push(statRow("Scale", c.scale, "Scale.png"));
    }
    return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{rows}</div>;
  }

  function renderRarityRow(r: { id: number; setCode?: string; rarity?: string; collectionAmount?: number; setPrice?: number }) {
    const group = getRarityGroup(r.rarity);
    const icon = rarityGroupIcons[group];
    const formattedPrice = r.setPrice != null ? `$${r.setPrice.toFixed(2)}` : "–";

    return (
      <div key={`${r.id}-${r.setCode}-${r.rarity}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <img src={icon} style={{ height: 20 }} alt={r.rarity} />}
        <span style={{ minWidth: 20, textAlign: "right" }}>{r.collectionAmount ?? 0}</span>
        <button onClick={(e) => handleCollectionChange(e, r, 1)}>+</button>
        <button onClick={(e) => handleCollectionChange(e, r, -1)} disabled={(r.collectionAmount ?? 0) <= 0}>-</button>
        <span style={{ color: "#4caf50", fontWeight: "bold", minWidth: 48 }}>{formattedPrice}</span>
      </div>
    );
  }

  return (
    <div style={{
      flex: 2,
      minWidth: 0,
      padding: 20,
      border: "1px solid #ccc",
      borderRadius: 8,
      overflow: "auto",
      height: "100%",
      boxSizing: "border-box",
    }}>
      {!card && !loading && <p>Select a card</p>}
      {loading && <p>Loading…</p>}

      {card && !loading && (
        <>
          {/* NAME + ATTRIBUTE */}
          <div style={{
            background: frameBackground,
            padding: "10px 15px",
            borderRadius: 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 15,
          }}>
            <h2 style={{ margin: 0 }}>{card.name}</h2>
            {card.attribute && (
              <img src={`/icons/attributes/${card.attribute}.png`} style={{ height: 28 }} alt={card.attribute} />
            )}
          </div>

          {/* IMAGE + STATS */}
          <div style={{ display: "flex", gap: 20 }}>
            <img src={card.imgPath?.replace("asset://", "/")} width={250} alt={card.name} />
            {renderStats(card)}
          </div>

          {/* TYPELINE BAR */}
          <div style={{
            marginTop: 15,
            padding: 8,
            borderRadius: 4,
            background: frameBackground,
            textAlign: "center",
            fontWeight: "bold",
          }}>
            {typeline}
          </div>

          {/* DESCRIPTION */}
          <div style={{ marginTop: 15, whiteSpace: "pre-wrap" }}>
            {card.desc}
          </div>

          {/* SET / RARITY SECTION */}
          <div style={{ marginTop: 20 }}>
            {card.sets.map((set: CardSet) => (
              <div key={set.setCode ?? "unknown"} style={{ marginBottom: 12 }}>
                <h4>{set.setName ?? set.setCode}</h4>
                {set.rarities.map((r: CardSetRarity) =>
                  renderRarityRow({
                    id: card.id,
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
  );
}
