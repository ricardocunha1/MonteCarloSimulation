import type { ReactNode } from "react";
import { HUB_NAME } from "../../lib/tools";
import { Layout } from "../Layout";

/** Hub `Layout` plus the Release Plan view header ("Release Plan" heading); sets the document title. */
export function ReleasePlanLayout({
  page,
  children,
}: {
  /** Optional page name appended to the document title ("CM Estimations Hub – Release Plan – <page>"). */
  page?: string;
  children: ReactNode;
}) {
  const title = page ? `${HUB_NAME} – Release Plan – ${page}` : `${HUB_NAME} – Release Plan`;
  return (
    <Layout title={title}>
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-800">
        <h2 className="text-lg font-semibold">Release Plan</h2>
      </div>
      <div className="px-6 py-8">{children}</div>
    </Layout>
  );
}
