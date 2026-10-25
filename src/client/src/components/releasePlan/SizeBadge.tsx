/** T-shirt size pill; "?" when not estimated. */
export function SizeBadge({ size }: { size: string }) {
  return (
    <span className={size ? "tsize" : "tsize none"} title={size ? `Estimated size: ${size}` : "Not estimated"}>
      {size || "?"}
    </span>
  );
}
