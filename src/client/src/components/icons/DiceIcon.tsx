/** Inline pair-of-dice icon (casino / random sampling) for the Monte Carlo tool. */
export function DiceIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* Front die showing three, tilted left. */}
      <g transform="rotate(-12 8 15)">
        <rect x="2.5" y="9.5" width="11" height="11" rx="2" />
        <g fill="currentColor" stroke="none">
          <circle cx="5.3" cy="12.3" r="1" />
          <circle cx="8" cy="15" r="1" />
          <circle cx="10.7" cy="17.7" r="1" />
        </g>
      </g>
      {/* Back die showing two, tilted right. */}
      <g transform="rotate(15 16.5 7.5)">
        <rect x="12" y="3" width="9" height="9" rx="2" />
        <g fill="currentColor" stroke="none">
          <circle cx="14.4" cy="5.4" r="0.9" />
          <circle cx="18.6" cy="9.6" r="0.9" />
        </g>
      </g>
    </svg>
  );
}
