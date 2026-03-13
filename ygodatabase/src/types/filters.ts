// All optional filter values passed to load_card_stubs.
// null means "no filter applied".
export interface CardFilters {
  name: string;
  category: string | null;  // "monster" | "spell" | "trap" — frontend concept
  frameType: string | null;  // exact DB frameType (subcategory); null = any within category
  race: string | null;
  attribute: string | null;
  level: string;
  scale: string;
  atk: string;
  def: string;
  banStatus: string | null;
}

export const EMPTY_FILTERS: CardFilters = {
  name: "",
  category: null,
  frameType: null,
  race: null,
  attribute: null,
  level: "",
  scale: "",
  atk: "",
  def: "",
  banStatus: null,
};

// ── Static option lists ─────────────────────────────────────────────────────

// frameType values that count as monsters (including pendulum variants)
export const MONSTER_FRAME_TYPES = [
  "normal", "effect", "ritual", "fusion", "synchro", "xyz", "link",
  "normal_pendulum", "effect_pendulum", "ritual_pendulum",
  "fusion_pendulum", "synchro_pendulum", "xyz_pendulum",
];

export const SPELL_FRAME_TYPES = ["spell"];
export const TRAP_FRAME_TYPES = ["trap"];

// Category → displayed label
export const CATEGORY_OPTIONS = [
  { value: "monster", label: "Monster" },
  { value: "spell", label: "Spell" },
  { value: "trap", label: "Trap" },
];

// Subcategory options per category — value is the DB frameType
export const SUBCATEGORY_OPTIONS: Record<string, { value: string; label: string }[]> = {
  monster: [
    { value: "normal", label: "Normal" },
    { value: "effect", label: "Effect" },
    { value: "ritual", label: "Ritual" },
    { value: "fusion", label: "Fusion" },
    { value: "synchro", label: "Synchro" },
    { value: "xyz", label: "Xyz" },
    { value: "link", label: "Link" },
    { value: "normal_pendulum", label: "Normal Pendulum" },
    { value: "effect_pendulum", label: "Effect Pendulum" },
    { value: "ritual_pendulum", label: "Ritual Pendulum" },
    { value: "fusion_pendulum", label: "Fusion Pendulum" },
    { value: "synchro_pendulum", label: "Synchro Pendulum" },
    { value: "xyz_pendulum", label: "Xyz Pendulum" },
  ],
  spell: [
    { value: "spell", label: "Spell (any)" },  // frameType is always "spell";
                                                // subtype is in the `race` column
  ],
  trap: [
    { value: "trap",  label: "Trap (any)"  },
  ],
};

// Race options vary by category
// For monsters: the creature type (Dragon, Warrior, …)
// For spells/traps: the subtype (Continuous, Quick-Play, …) stored in `race`
export const RACE_OPTIONS: Record<string, string[]> = {
  monster: [
    "Aqua", "Beast", "Beast-Warrior", "Creator God", "Cyberse", "Dinosaur",
    "Divine-Beast", "Dragon", "Fairy", "Fiend", "Fish", "Illusion",
    "Insect", "Machine", "Plant", "Psychic", "Pyro", "Reptile",
    "Rock", "Sea Serpent", "Spellcaster", "Thunder", "Warrior",
    "Winged Beast", "Wyrm", "Zombie",
  ],
  spell: [
    "Normal", "Quick-Play", "Continuous", "Ritual", "Equip", "Field",
  ],
  trap: [
    "Normal", "Continuous", "Counter",
  ],
};

export const ATTRIBUTE_OPTIONS = [
  "DARK", "DIVINE", "EARTH", "FIRE", "LIGHT", "WATER", "WIND",
];

export const BAN_STATUS_OPTIONS = [
  { value: "Forbidden", label: "Forbidden" },
  { value: "Limited", label: "Limited" },
  { value: "Semi-Limited", label: "Semi-Limited" },
];