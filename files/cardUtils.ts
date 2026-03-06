import { rarityGroups } from "../constants/rarity";
import { FRAME_COLORS } from "../constants/frames";
import type { CardDetail } from "../types/cards";

export function getRarityGroup(rarity?: string | null): string {
  if (!rarity) return "unknown";
  const normalized = rarity.trim().toLowerCase();
  for (const [group, values] of Object.entries(rarityGroups)) {
    if (values.some((v) => v.trim().toLowerCase() === normalized)) return group;
  }
  return "unknown";
}

export function getFrameBackground(frameType?: string): string {
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

export function formatTypeline(card: CardDetail): string {
  if (card.typeline && Array.isArray(card.typeline)) {
    return `[${card.typeline.join("/")}]`;
  }
  if (card.frameType) {
    return `[${card.frameType.charAt(0).toUpperCase() + card.frameType.slice(1)}]`;
  }
  return "";
}
