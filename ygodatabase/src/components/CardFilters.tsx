import type { CardFilters } from "../types/filters";
import {
  CATEGORY_OPTIONS,
  SUBCATEGORY_OPTIONS,
  RACE_OPTIONS,
  ATTRIBUTE_OPTIONS,
  BAN_STATUS_OPTIONS,
  EMPTY_FILTERS,
} from "../types/filters";

interface CardFiltersProps {
  filters: CardFilters;
  onChange: (f: CardFilters) => void;
  resultCount: number;   // passed in so the bar can show "0 results" feedback
  loading: boolean;
}

export default function CardFilters({ filters, onChange, resultCount, loading }: CardFiltersProps) {
  const cat = filters.category;

  function set(patch: Partial<CardFilters>) {
    onChange({ ...filters, ...patch });
  }

  function handleCategoryChange(val: string) {
    if (!val) {
      // Clear everything that depends on category
      set({ category: null, frameType: null, race: null, attribute: null,
            level: "", scale: "", atk: "", def: "" });
    } else if (val === "spell") {
      set({ category: "spell", frameType: null, race: null, attribute: null,
            level: "", scale: "", atk: "", def: "" });
    } else if (val === "trap") {
      set({ category: "trap",  frameType: null, race: null, attribute: null,
            level: "", scale: "", atk: "", def: "" });
    } else {
      // monster — no frameType yet, user picks subcategory separately
      set({ category: "monster", frameType: null, race: null, attribute: null });
    }
  }

  function handleFrameTypeChange(val: string) {
    // Changing subcategory clears race (subtype) since the lists differ
    set({ frameType: val || null, race: null });
  }

  function numericSet(key: keyof CardFilters, val: string) {
    if (val === "" || /^\d+$/.test(val)) set({ [key]: val });
  }

  const isMonster = cat === "monster";
  const showSub = isMonster;
  const showAttr = isMonster;
  const showLevel = isMonster;
  const showScale = filters.frameType?.includes("pendulum") ?? false;
  const showDef = isMonster && filters.frameType !== "link";
  const showAtk = isMonster;
  const showRace = cat !== null;  // monster race OR spell/trap subtype

  const subOptions  = cat ? (SUBCATEGORY_OPTIONS[cat] ?? []) : [];
  const raceOptions = cat ? (RACE_OPTIONS[cat] ?? []) : [];

  // Active filter count (excluding name, which lives in the topbar)
  const activeCount = [
    filters.category, filters.frameType, filters.race, filters.attribute,
    filters.level || null, filters.scale || null,
    filters.atk || null, filters.def || null, filters.banStatus,
  ].filter(Boolean).length;

  const hasFilters = activeCount > 0;
  const noResults  = !loading && hasFilters && resultCount === 0;

  return (
    <>
      <style>{`
        .cf-root {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding: 7px 20px;
          border-bottom: 1px solid rgba(212,175,55,0.12);
          background: rgba(0,0,0,0.1);
          flex-shrink: 0;
        }

        .cf-select, .cf-input {
          padding: 5px 8px;
          background: #111;
          color: #ccc;
          border: 1px solid #2a2a2a;
          border-radius: 2px;
          font-size: 12px;
          font-family: inherit;
          transition: border-color 0.15s;
        }
        .cf-select:focus, .cf-input:focus {
          outline: none;
          border-color: rgba(212,175,55,0.4);
        }
        .cf-select { cursor: pointer; }
        .cf-input  { width: 68px; }
        .cf-input::placeholder { color: #3a3a3a; }

        .cf-label {
          font-size: 11px;
          color: rgba(200,150,40,0.45);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .cf-group {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .cf-divider {
          width: 1px;
          height: 20px;
          background: rgba(212,175,55,0.12);
          margin: 0 2px;
        }

        .cf-clear-btn {
          padding: 4px 10px;
          background: transparent;
          color: rgba(200,80,80,0.6);
          border: 1px solid rgba(200,80,80,0.2);
          border-radius: 2px;
          font-size: 11px;
          cursor: pointer;
          letter-spacing: 0.1em;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .cf-clear-btn:hover {
          color: #e05555;
          border-color: rgba(200,80,80,0.5);
          background: rgba(200,50,50,0.07);
        }

        .cf-no-results {
          font-size: 11px;
          color: #c0392b;
          letter-spacing: 0.08em;
          margin-left: 4px;
          opacity: 0.85;
        }

        .cf-count {
          font-size: 11px;
          color: rgba(200,150,40,0.3);
          letter-spacing: 0.05em;
          margin-left: 4px;
        }
      `}</style>

      <div className="cf-root">

        {/* Category */}
        <div className="cf-group">
          <span className="cf-label">Category</span>
          <select
            className="cf-select"
            value={cat ?? ""}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            <option value="">Any</option>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Subcategory — monsters only */}
        {showSub && (
          <div className="cf-group">
            <span className="cf-label">Subtype</span>
            <select
              className="cf-select"
              value={filters.frameType ?? ""}
              onChange={(e) => handleFrameTypeChange(e.target.value)}
            >
              <option value="">Any</option>
              {subOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Attribute — monsters only */}
        {showAttr && (
          <div className="cf-group">
            <span className="cf-label">Attribute</span>
            <select
              className="cf-select"
              value={filters.attribute ?? ""}
              onChange={(e) => set({ attribute: e.target.value || null })}
            >
              <option value="">Any</option>
              {ATTRIBUTE_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        )}

        {/* Race / spell subtype */}
        {showRace && raceOptions.length > 0 && (
          <div className="cf-group">
            <span className="cf-label">{isMonster ? "Race" : "Subtype"}</span>
            <select
              className="cf-select"
              value={filters.race ?? ""}
              onChange={(e) => set({ race: e.target.value || null })}
            >
              <option value="">Any</option>
              {raceOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}

        {(isMonster || cat === "spell" || cat === "trap") && <div className="cf-divider" />}

        {/* Level / Rank / Link */}
        {showLevel && (
          <div className="cf-group">
            <span className="cf-label">Lvl</span>
            <input className="cf-input" placeholder="Any" value={filters.level}
              onChange={(e) => numericSet("level", e.target.value)} />
          </div>
        )}

        {/* Scale */}
        {showScale && (
          <div className="cf-group">
            <span className="cf-label">Scale</span>
            <input className="cf-input" placeholder="Any" value={filters.scale}
              onChange={(e) => numericSet("scale", e.target.value)} />
          </div>
        )}

        {/* ATK */}
        {showAtk && (
          <div className="cf-group">
            <span className="cf-label">ATK</span>
            <input className="cf-input" placeholder="Any" value={filters.atk}
              onChange={(e) => numericSet("atk", e.target.value)} />
          </div>
        )}

        {/* DEF */}
        {showDef && (
          <div className="cf-group">
            <span className="cf-label">DEF</span>
            <input className="cf-input" placeholder="Any" value={filters.def}
              onChange={(e) => numericSet("def", e.target.value)} />
          </div>
        )}

        <div className="cf-divider" />

        {/* Ban status */}
        <div className="cf-group">
          <span className="cf-label">Limit</span>
          <select
            className="cf-select"
            value={filters.banStatus ?? ""}
            onChange={(e) => set({ banStatus: e.target.value || null })}
          >
            <option value="">Any</option>
            {BAN_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Clear */}
        {hasFilters && (
          <button
            className="cf-clear-btn"
            onClick={() => onChange({ ...EMPTY_FILTERS, name: filters.name })}
          >
            Clear {activeCount > 1 ? `(${activeCount})` : ""}
          </button>
        )}

        {/* Result feedback */}
        {loading && <span className="cf-count">Searching…</span>}
        {noResults && <span className="cf-no-results">No cards match these filters</span>}
        {!loading && !noResults && hasFilters && (
          <span className="cf-count">{resultCount} result{resultCount !== 1 ? "s" : ""}</span>
        )}

      </div>
    </>
  );
}
