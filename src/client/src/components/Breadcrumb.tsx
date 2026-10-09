// Port of _breadcrumb.html.
const STEPS: [number, string][] = [
  [1, "Input"],
  [2, "Validation"],
  [3, "Execution & Results"],
];

export function Breadcrumb({ currentStep }: { currentStep: number }) {
  return (
    <nav className="px-6 py-3 border-b border-slate-800 bg-slate-900" aria-label="Progress">
      <ol className="flex items-center justify-center gap-2 max-w-3xl mx-auto text-sm">
        {STEPS.map(([stepNumber, stepLabel], index) => {
          const active = stepNumber === currentStep;
          return (
            <li key={stepNumber} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <div className="flex items-center gap-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={
                    active
                      ? { backgroundColor: "var(--cm-light-blue)", color: "#04101d" }
                      : { backgroundColor: "#1e293b", color: "#94a3b8" }
                  }
                >
                  {stepNumber}
                </span>
                <span style={active ? { color: "var(--cm-light-blue)", fontWeight: 600 } : { color: "#94a3b8" }}>
                  {stepLabel}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <span className="w-10 border-t border-dashed border-slate-300/70" />
                )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
