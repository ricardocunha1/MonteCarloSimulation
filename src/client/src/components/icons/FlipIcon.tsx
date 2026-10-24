const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

/** A tall column, a wide row and a turning arrow: swapping rows and columns ("Flip board"). */
export function FlipIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} {...svgProps}>
      <rect x="3" y="3" width="6" height="18" rx="1.5" />
      <rect x="12" y="15" width="9" height="6" rx="1.5" />
      <path d="M12 5h4a3 3 0 0 1 3 3v3" />
      <path d="M16.5 9 19 11.5 21.5 9" />
    </svg>
  );
}
