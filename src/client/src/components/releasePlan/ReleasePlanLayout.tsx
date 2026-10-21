import type { ReactNode } from "react";
import { HUB_NAME } from "../../lib/tools";
import { Layout } from "../Layout";

/** Hub `Layout` for the Release Plan pages; sets the document title. */
export function ReleasePlanLayout({
  page,
  children,
}: {
  /** Optional page name appended to the document title ("Planning Hub – Release Plan – <page>"). */
  page?: string;
  children: ReactNode;
}) {
  const title = page ? `${HUB_NAME} – Release Plan – ${page}` : `${HUB_NAME} – Release Plan`;
  return (
    <Layout title={title}>
      <div className="px-6 py-8">{children}</div>
    </Layout>
  );
}
