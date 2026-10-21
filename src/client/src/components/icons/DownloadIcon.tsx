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

/** Arrow dropping into a tray: downloading the plan as a file ("Save Plan"). */
export function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <path d="M12 4v11" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
    </svg>
  );
}
