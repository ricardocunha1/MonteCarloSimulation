import { NavLink } from "react-router-dom";
import { TOOL_GROUPS } from "../lib/tools";

/** Group heading: the label centered between two lines filling the panel width. */
function GroupDivider({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="h-px flex-1 bg-slate-600" aria-hidden="true" />
      <span id={id} className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="h-px flex-1 bg-slate-600" aria-hidden="true" />
    </div>
  );
}

/** Left dashboard panel listing the hub's tools, grouped by category. */
export function Sidebar() {
  return (
    <nav aria-label="Hub navigation" className="flex flex-col gap-4 p-3">
      {TOOL_GROUPS.map((group) => (
        <div key={group.id} role="group" aria-labelledby={`sidebar-group-${group.id}`}>
          <GroupDivider id={`sidebar-group-${group.id}`} label={group.label} />
          <ul className="mt-1 flex flex-col gap-1">
            {group.tools.map(({ id, name, path, icon: Icon }) => (
              <li key={id}>
                <NavLink
                  to={path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)] ${
                      isActive ? "bg-slate-800 text-[color:var(--cm-teal)]" : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                    }`
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
