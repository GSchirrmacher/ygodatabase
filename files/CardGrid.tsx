import { useRef, useEffect, useState } from "react";
import { List } from "react-window";
import type { CardStub, CardDetail } from "../types/cards";
import { getRarityGroup } from "../utils/cardUtils";
import { rarityGroupColors, rarityGroupIcons } from "../constants/rarity";

interface CardGridProps {
  cards: CardStub[];
  selectedCard: CardDetail | null;
  onCardClick: (card: CardStub) => void;
}

export default function CardGrid({ cards, selectedCard, onCardClick }: CardGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setGridWidth(entries[0].contentRect.width);
    });
    if (gridRef.current) observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, []);

  const CARD_WIDTH = 140;
  const CARD_HEIGHT = 180;

  return (
    <div ref={gridRef} style={{ flex: 3, minWidth: 0, height: "100%", overflow: "hidden" }}>
      {gridWidth > 0 && (() => {
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
              const rowCards = cards.slice(start, start + columnCount);

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
                        key={`${c.id}-${c.imageId ?? "base"}`}
                        style={{
                          position: "relative",
                          cursor: "pointer",
                          border: `2px solid ${rarityColor}`,
                          borderRadius: 8,
                          transition: "all 0.15s ease",
                        }}
                        onClick={() => onCardClick(c)}
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
                          <div style={{
                            position: "absolute",
                            bottom: 6,
                            right: 6,
                            background: "rgba(0,0,0,0.75)",
                            color: "white",
                            fontSize: 12,
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}>
                            +{additionalCount}
                          </div>
                        )}

                        {c.totalCollectionAmount > 0 && (
                          <div style={{
                            position: "absolute",
                            top: 6,
                            left: 6,
                            background: "rgba(76,175,80,0.9)",
                            color: "white",
                            fontSize: 12,
                            fontWeight: "bold",
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}>
                            {c.totalCollectionAmount}×
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
  );
}
