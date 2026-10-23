import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { loadSidebarCollapsed, saveSidebarCollapsed } from "../lib/sidebarPreference";
import { HUB_NAME } from "../lib/tools";
import { Sidebar } from "./Sidebar";

/**
 * Dashboard shell: global header (logo + hub name), left sidebar and main content area.
 * Owns the sidebar's collapsed state, persisted in localStorage across pages and reloads.
 */
export function Layout({ title, children }: { title: string; children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);

  useEffect(() => {
    document.title = title;
  }, [title]);

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    saveSidebarCollapsed(next);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-slate-800" style={{ backgroundColor: "var(--cm-dark-blue)" }}>
        <Link to="/" aria-label={`${HUB_NAME} home`}>
          <img src="/cmlogo.png" alt="CM Logo" className="h-10 w-auto" />
        </Link>
        <h1 className="text-xl font-semibold">{HUB_NAME}</h1>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside
          data-collapsed={sidebarCollapsed}
          className={`overflow-hidden border-b border-slate-800 bg-slate-900 transition-[width] duration-200 md:shrink-0 md:border-b-0 md:border-r ${
            sidebarCollapsed ? "md:w-16" : "md:w-60"
          }`}
        >
          <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
