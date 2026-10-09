// Port of _errors.html.
export function ErrorList({
  errors,
  heading = "Please correct the following:",
}: {
  errors: string[];
  heading?: string;
}) {
  if (errors.length === 0) {
    return null;
  }
  return (
    <div role="alert" className="rounded-lg border border-red-700 bg-red-950/50 p-4 mb-6 max-w-xl mx-auto">
      <p className="font-semibold text-red-300 mb-2">{heading}</p>
      <ul className="list-disc list-inside text-red-200 space-y-1">
        {errors.map((error, index) => (
          <li key={index}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
