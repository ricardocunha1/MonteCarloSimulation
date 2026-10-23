import type { AdoTreeNode } from "./adoTypes";

/** Nodes from `root` down to the node whose path equals `path` (case-insensitive), or `null`. */
export function findNodeChain(root: AdoTreeNode, path: string): AdoTreeNode[] | null {
  const target = path.toLowerCase();
  const walk = (node: AdoTreeNode): AdoTreeNode[] | null => {
    if (node.path.toLowerCase() === target) {
      return [node];
    }
    for (const child of node.children) {
      const chain = walk(child);
      if (chain) {
        return [node, ...chain];
      }
    }
    return null;
  };
  return walk(root);
}

/**
 * Paths of the nodes whose name or path contains `query` (case-insensitive)
 * plus all their ancestors; `null` when `query` is blank (no filter).
 */
export function filterTree(root: AdoTreeNode, query: string): Set<string> | null {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return null;
  }
  const visible = new Set<string>();
  const walk = (node: AdoTreeNode): boolean => {
    let keep = node.name.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle);
    for (const child of node.children) {
      keep = walk(child) || keep;
    }
    if (keep) {
      visible.add(node.path);
    }
    return keep;
  };
  walk(root);
  return visible;
}

/** Paths of the nodes in `visible` that have a visible child (the ones to expand so every match shows). */
export function expandedForFilter(root: AdoTreeNode, visible: ReadonlySet<string>): Set<string> {
  const expanded = new Set<string>();
  const walk = (node: AdoTreeNode) => {
    for (const child of node.children) {
      if (visible.has(child.path)) {
        expanded.add(node.path);
        walk(child);
      }
    }
  };
  if (visible.has(root.path)) {
    walk(root);
  }
  return expanded;
}

/** One rendered row of the tree. */
export interface TreeRow {
  node: AdoTreeNode;
  /** 1-based depth (`aria-level`). */
  level: number;
  /** Path of the parent row, `null` for the root. */
  parentPath: string | null;
  /** Whether the node has (visible) children. */
  hasChildren: boolean;
  expanded: boolean;
}

/** The rows shown for `expanded` nodes, depth-first; only nodes in `visible` when it is not `null`. */
export function visibleRows(root: AdoTreeNode, expanded: ReadonlySet<string>, visible: ReadonlySet<string> | null): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (node: AdoTreeNode, level: number, parentPath: string | null) => {
    if (visible && !visible.has(node.path)) {
      return;
    }
    const children = visible ? node.children.filter((c) => visible.has(c.path)) : node.children;
    const isExpanded = children.length > 0 && expanded.has(node.path);
    rows.push({ node, level, parentPath, hasChildren: children.length > 0, expanded: isExpanded });
    if (isExpanded) {
      children.forEach((child) => walk(child, level + 1, node.path));
    }
  };
  walk(root, 1, null);
  return rows;
}
