/** Inline roadmap icon (winding path ending at a flag) for the Release Plan tool. */
export function RoadmapIcon({ className = "h-5 w-5" }: { className?: string }) {
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
      {/* Flag pole and pennant at the destination. */}
      <path d="M17 13V3" />
      <path d="M17 3.5h4.5l-1.5 2.25 1.5 2.25H17" fill="currentColor" />
      {/* Winding road from the start point to the flag. */}
      <path d="M4 20.5h7.5a2.75 2.75 0 0 0 0-5.5h-3a2.75 2.75 0 0 1 0-5.5H13" strokeDasharray="2.2 2" />
      <circle cx="4" cy="20.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="13" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
