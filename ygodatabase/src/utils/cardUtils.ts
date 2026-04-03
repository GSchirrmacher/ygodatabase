import { rarityGroups } from "../constants/rarity";
import { FRAME_COLORS } from "../constants/frames";
import type { CardDetail } from "../types/cards";
import type { CardFilters } from "../types/filters";

/** Converts a CardFilters object into the params record expected by load_card_stubs. */
export function filtersToParams(f: CardFilters, format?: string): Record<string, string | number> {
  const p: Record<string, string | number> = {};
  if (f.name.trim())   p.name      = f.name.trim();
  if (f.category) p.category = f.category;
  if (f.frameType) p.frameType = f.frameType;
  if (f.attribute) p.attribute = f.attribute;
  if (f.race) p.race = f.race;
  if (f.level.trim()) p.level = parseInt(f.level, 10);
  if (f.scale.trim()) p.scale = parseInt(f.scale, 10);
  if (f.atk.trim()) p.atk = parseInt(f.atk, 10);
  if (f.def.trim()) p.def = parseInt(f.def, 10);
  if (f.banStatus) p.banStatus = f.banStatus;
  if (f.archetype.trim()) p.archetype = f.archetype.trim();
  if (f.genesysPointsMin.trim()) p.genesysPointsMin = parseInt(f.genesysPointsMin, 10);
  if (f.genesysPointsMax.trim()) p.genesysPointsMax = parseInt(f.genesysPointsMax, 10);
  if (format) p.format = format;
  return p;
}

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