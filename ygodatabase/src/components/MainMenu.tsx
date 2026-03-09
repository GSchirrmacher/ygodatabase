import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface MainMenuProps {
  onNavigate: (screen: "collection" | "deckbuilder") => void;
}

export default function MainMenu({ onNavigate }: MainMenuProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Staggered entrance — tiny delay so the browser has painted first
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  function handleExit() {
    invoke("exit_app").catch(() => {
      // Fallback if command isn't registered yet
      window.close();
    });
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;600&display=swap');

        .mm-root {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0a0c10;
          overflow: hidden;
          font-family: 'Cinzel', serif;
        }

        /* Animated background: faint diagonal card-back pattern */
        .mm-root::before {
          content: '';
          position: absolute;
          inset: -50%;
          background-image:
            repeating-linear-gradient(
              45deg,
              transparent,
              transparent 38px,
              rgba(180,140,40,0.04) 38px,
              rgba(180,140,40,0.04) 40px
            ),
            repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 38px,
              rgba(180,140,40,0.04) 38px,
              rgba(180,140,40,0.04) 40px
            );
          animation: bgDrift 60s linear infinite;
          pointer-events: none;
        }

        @keyframes bgDrift {
          from { transform: translate(0, 0); }
          to   { transform: translate(80px, 80px); }
        }

        /* Radial vignette to focus attention on center */
        .mm-root::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, rgba(0,0,0,0.75) 100%);
          pointer-events: none;
        }

        .mm-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .mm-content.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Eye of Anubis decorative divider ── */
        .mm-eye {
          width: 48px;
          height: 48px;
          margin-bottom: 16px;
          opacity: 0.7;
          filter: drop-shadow(0 0 8px rgba(212,175,55,0.6));
        }

        /* ── Title ── */
        .mm-title {
          font-family: 'Cinzel Decorative', serif;
          font-size: clamp(28px, 4vw, 52px);
          font-weight: 900;
          letter-spacing: 0.12em;
          color: transparent;
          background: linear-gradient(160deg, #f0d060 0%, #c8960c 40%, #f0d060 60%, #a07010 100%);
          -webkit-background-clip: text;
          background-clip: text;
          text-shadow: none;
          filter: drop-shadow(0 2px 18px rgba(212,175,55,0.35));
          margin: 0;
          text-align: center;
          line-height: 1.15;
        }

        .mm-subtitle {
          font-family: 'Cinzel', serif;
          font-size: clamp(11px, 1.2vw, 14px);
          font-weight: 400;
          letter-spacing: 0.5em;
          color: rgba(200,160,40,0.55);
          text-transform: uppercase;
          margin: 10px 0 48px;
          text-align: center;
        }

        /* ── Divider line ── */
        .mm-divider {
          width: 280px;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(212,175,55,0.5), transparent);
          margin-bottom: 48px;
        }

        /* ── Buttons ── */
        .mm-buttons {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 320px;
        }

        .mm-btn {
          position: relative;
          padding: 16px 32px;
          border: none;
          border-radius: 2px;
          cursor: pointer;
          font-family: 'Cinzel', serif;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          transition: transform 0.15s ease, filter 0.15s ease;
          overflow: hidden;
          outline: none;
        }

        .mm-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .mm-btn:hover {
          transform: translateY(-2px);
          filter: brightness(1.15);
        }
        .mm-btn:hover::before {
          opacity: 1;
        }
        .mm-btn:active {
          transform: translateY(0px);
          filter: brightness(0.95);
        }

        /* Primary gold button */
        .mm-btn-primary {
          background: linear-gradient(135deg, #1a1400 0%, #2e2000 50%, #1a1400 100%);
          color: #f0d060;
          border: 1px solid rgba(212,175,55,0.6);
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.8),
            inset 0 1px 0 rgba(255,220,80,0.15),
            0 4px 20px rgba(0,0,0,0.6);
        }
        .mm-btn-primary::before {
          background: linear-gradient(135deg, rgba(212,175,55,0.08), transparent);
        }

        /* Secondary darker button */
        .mm-btn-secondary {
          background: linear-gradient(135deg, #0e1118 0%, #161c28 50%, #0e1118 100%);
          color: #8aadcc;
          border: 1px solid rgba(100,150,200,0.35);
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.8),
            inset 0 1px 0 rgba(140,180,220,0.08),
            0 4px 20px rgba(0,0,0,0.6);
        }
        .mm-btn-secondary::before {
          background: linear-gradient(135deg, rgba(100,150,210,0.08), transparent);
        }

        /* Exit — muted red */
        .mm-btn-exit {
          background: transparent;
          color: rgba(180,80,80,0.7);
          border: 1px solid rgba(180,80,80,0.25);
          box-shadow: none;
          font-size: 13px;
          padding: 10px 32px;
          margin-top: 8px;
          letter-spacing: 0.3em;
        }
        .mm-btn-exit:hover {
          color: rgba(220,100,100,0.9);
          border-color: rgba(220,100,100,0.5);
          background: rgba(180,40,40,0.08);
          filter: none;
        }

        /* Corner ornaments */
        .mm-corner {
          position: absolute;
          width: 40px;
          height: 40px;
          opacity: 0.25;
          z-index: 1;
        }
        .mm-corner svg { width: 100%; height: 100%; }
        .mm-corner.tl { top: 24px; left: 24px; }
        .mm-corner.tr { top: 24px; right: 24px; transform: scaleX(-1); }
        .mm-corner.bl { bottom: 24px; left: 24px; transform: scaleY(-1); }
        .mm-corner.br { bottom: 24px; right: 24px; transform: scale(-1); }

        /* Staggered button entrance */
        .mm-btn:nth-child(1) { transition-delay: 0.1s; }
        .mm-btn:nth-child(2) { transition-delay: 0.18s; }
        .mm-btn:nth-child(3) { transition-delay: 0.26s; }
      `}</style>

      <div className="mm-root">

        {/* Corner ornaments */}
        {(["tl","tr","bl","br"] as const).map((pos) => (
          <div key={pos} className={`mm-corner ${pos}`}>
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 38 L2 2 L38 2" stroke="#c8960c" strokeWidth="1.5" fill="none"/>
              <path d="M2 2 L10 10" stroke="#c8960c" strokeWidth="1" opacity="0.6"/>
              <circle cx="2" cy="2" r="2" fill="#c8960c"/>
            </svg>
          </div>
        ))}

        <div className={`mm-content ${visible ? "visible" : ""}`}>

          {/* Decorative SVG eye */}
          <svg className="mm-eye" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="24" cy="24" rx="22" ry="10" stroke="#c8960c" strokeWidth="1.2"/>
            <circle cx="24" cy="24" r="7" stroke="#c8960c" strokeWidth="1.2"/>
            <circle cx="24" cy="24" r="3" fill="#c8960c"/>
            <line x1="24" y1="4" x2="24" y2="14" stroke="#c8960c" strokeWidth="1"/>
            <line x1="24" y1="34" x2="24" y2="44" stroke="#c8960c" strokeWidth="1"/>
          </svg>

          <h1 className="mm-title">YGO Manager</h1>
          <p className="mm-subtitle">Card Database &amp; Deck Builder</p>

          <div className="mm-divider" />

          <div className="mm-buttons">
            <button className="mm-btn mm-btn-primary" onClick={() => onNavigate("collection")}>
              ⬡ &nbsp; Collection Manager
            </button>
            <button className="mm-btn mm-btn-secondary" onClick={() => onNavigate("deckbuilder")}>
              ⬡ &nbsp; Deck Builder
            </button>
            <button className="mm-btn mm-btn-exit" onClick={handleExit}>
              ✕ &nbsp; Exit
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
