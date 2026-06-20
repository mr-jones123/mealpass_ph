import { StellarWalletPanel } from "./components/StellarWalletPanel";

function App() {
  return (
    <main className="app-frame">
      <svg className="sky-scene" viewBox="0 0 1440 760" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="14" stdDeviation="10" floodColor="#2f79b8" floodOpacity="0.16" />
          </filter>
          <linearGradient id="hill-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#b9c978" />
            <stop offset="1" stopColor="#8faa55" />
          </linearGradient>
        </defs>

        <circle cx="1210" cy="88" r="86" fill="#f1c84b" />
        <circle cx="1168" cy="50" r="110" fill="#f6d963" opacity="0.32" />

        <g filter="url(#soft-shadow)">
          <g transform="translate(144 118)">
            <ellipse cx="82" cy="42" rx="70" ry="38" fill="#fffaf0" />
            <ellipse cx="145" cy="46" rx="52" ry="31" fill="#fffaf0" />
            <ellipse cx="40" cy="54" rx="44" ry="27" fill="#fffaf0" />
            <rect x="38" y="42" width="150" height="42" rx="21" fill="#fffaf0" />
          </g>
          <g transform="translate(810 150) scale(0.82)">
            <ellipse cx="82" cy="42" rx="70" ry="38" fill="#fffaf0" />
            <ellipse cx="145" cy="46" rx="52" ry="31" fill="#fffaf0" />
            <ellipse cx="40" cy="54" rx="44" ry="27" fill="#fffaf0" />
            <rect x="38" y="42" width="150" height="42" rx="21" fill="#fffaf0" />
          </g>
          <g transform="translate(1030 278) scale(0.58)">
            <ellipse cx="82" cy="42" rx="70" ry="38" fill="#fffaf0" />
            <ellipse cx="145" cy="46" rx="52" ry="31" fill="#fffaf0" />
            <ellipse cx="40" cy="54" rx="44" ry="27" fill="#fffaf0" />
            <rect x="38" y="42" width="150" height="42" rx="21" fill="#fffaf0" />
          </g>
        </g>

        <path d="M-90 520C150 390 405 395 594 505c91 53 176 95 282 62 190-59 322-219 650-92v310H-90Z" fill="url(#hill-fill)" opacity="0.78" />
        <path d="M760 590c158-155 424-205 760-40v235H760Z" fill="#b8c76b" opacity="0.72" />
      </svg>
      <div className="fence-line" aria-hidden="true">
        {Array.from({ length: 56 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <StellarWalletPanel />
    </main>
  );
}

export default App;
