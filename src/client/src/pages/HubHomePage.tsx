import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ESTIMATION_TOOLS, HUB_NAME } from "../lib/tools";

/** Hub landing page: one card per estimation tool from the registry. */
export function HubHomePage() {
  return (
    <Layout title={HUB_NAME}>
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold">Welcome to the {HUB_NAME}</h2>
        <p className="mt-2 text-slate-400">Pick an estimation tool to get started.</p>
        <section aria-labelledby="hub-estimations-heading" className="mt-8">
          <h3 id="hub-estimations-heading" className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Estimations
          </h3>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ESTIMATION_TOOLS.map(({ id, name, path, description, goal, icon: Icon }) => (
              <li key={id}>
                <Link
                  to={path}
                  aria-label={`Open ${name}`}
                  className="flex h-full flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-5 transition-colors hover:border-[color:var(--cm-light-blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)]"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md" style={{ backgroundColor: "var(--cm-dark-blue)", color: "var(--cm-teal)" }}>
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="text-lg font-semibold">{name}</span>
                  </span>
                  <span className="text-sm text-slate-300">{description}</span>
                  <span className="text-sm text-slate-400">
                    <span className="font-semibold text-slate-200">Goal: </span>
                    {goal}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Layout>
  );
}
