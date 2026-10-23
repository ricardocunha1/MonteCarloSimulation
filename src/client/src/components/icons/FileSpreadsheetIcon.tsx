const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

/** Document-with-grid icon for the Monte Carlo "Import an Excel file" card. */
export function FileSpreadsheetIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 12h8v6H8z" />
      <path d="M8 15h8" />
      <path d="M12 12v6" />
    </svg>
  );
}
