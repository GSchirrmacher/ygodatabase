interface DeckBuilderProps {
  onBack: () => void;
}

export default function Deckbuilder({ onBack }: DeckBuilderProps) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&display=swap');

        .db-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #0a0c10;
          color: #ccc;
          font-family: 'Cinzel', serif;
          overflow: hidden;
          box-sizing: border-box;
        }

        .db-topbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 24px;
          border-bottom: 1px solid rgba(212,175,55,0.2);
          background: rgba(255,255,255,0.02);
          flex-shrink: 0;
        }

        .db-back-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 16px;
          background: transparent;
          color: rgba(200,150,40,0.8);
          border: 1px solid rgba(200,150,40,0.3);
          border-radius: 2px;
          cursor: pointer;
          font-family: 'Cinzel', serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .db-back-btn:hover {
          color: #f0d060;
          border-color: rgba(212,175,55,0.6);
          background: rgba(212,175,55,0.06);
        }

        .db-topbar-title {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.25em;
          color: rgba(200,150,40,0.7);
          text-transform: uppercase;
        }

        .db-placeholder {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          opacity: 0.35;
        }

        .db-placeholder-icon {
          font-size: 48px;
          filter: grayscale(1);
        }

        .db-placeholder p {
          font-size: 13px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #888;
          margin: 0;
        }
      `}</style>

      <div className="db-root">
        <div className="db-topbar">
          <button className="db-back-btn" onClick={onBack}>
            ← Main Menu
          </button>
          <span className="db-topbar-title">Deck Builder</span>
        </div>

        <div className="db-placeholder">
          <div className="db-placeholder-icon">🃏</div>
          <p>Coming soon</p>
        </div>
      </div>
    </>
  );
}
