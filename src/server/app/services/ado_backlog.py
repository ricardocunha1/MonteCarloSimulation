"""Azure DevOps reads for the Release Plan tool: the project, its Area /
Iteration classification trees and the Epics + Features of a scope
(plans/release-plan-ado.md "ADO REST calls used"). The server only fetches
and normalizes; the client builds the plan.

`connect`, `find_path`, `field_exists`, `query_ids` and `fetch_items` are
shared with the Monte Carlo sprint history fetch (`ado_sprint_history`)."""

import re
from collections.abc import Callable, Mapping
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import quote

from .ado_client import UNEXPECTED_RESPONSE, AdoClient, AdoError, is_utf8_text
from .ado_url import AdoProject

CLASSIFICATION_DEPTH = 50
# Deepest classification tree accepted; real ADO stops at CLASSIFICATION_DEPTH,
# anything deeper comes from a broken or hostile host.
MAX_TREE_DEPTH = 100

SIZE_FIELD = "Custom.EstimatedSize"
WORK_ITEM_FIELDS = (
    "System.Id",
    "System.WorkItemType",
    "System.Title",
    "System.State",
    "System.Parent",
    "System.IterationPath",
    "System.Description",
)
BACKLOG_TYPES = ("Epic", "Feature")
WIQL_TOP = 20000
BATCH_SIZE = 200
PARENT_LEVELS = 3

SCOPE_LABELS = {"area": "Area", "iteration": "Iteration"}
SCOPE_FIELDS = {"area": "System.AreaPath", "iteration": "System.IterationPath"}
SIZE_FIELD_MISSING = f"The field {SIZE_FIELD} does not exist in this project; sizes are empty."
CAP_REACHED = f"Only the first {WIQL_TOP} work items were loaded; narrow the scope."
SCOPE_REQUIRED = "Choose an Area path or an Iteration path."

_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def normalize_node_path(path: str) -> str:
    """Classification node path → `System.AreaPath` / `System.IterationPath` form.

    Drops the leading `\\` and the structure segment (`Area` / `Iteration`):
    `\\Proj\\Area\\Team A` → `Proj\\Team A`, and the root `\\Proj\\Area` → `Proj`.
    """
    segments = path.lstrip("\\").split("\\")
    return "\\".join(segments[:1] + segments[2:])


async def connect(client: AdoClient, ado_project: AdoProject) -> dict:
    """Validate the PAT + project and return the `/api/ado/connect` payload.

    Returns:
        `{project: {id, name}, projectUrl, areas, iterations}` with the
        canonical project name from Azure DevOps (see the API contract).

    Raises:
        AdoError: "Project not found: …" for a 404 on the project, or the
            client's mapped error for any other failure.
    """
    encoded = quote(ado_project.project, safe="")
    try:
        project = await client.get_json(f"_apis/projects/{encoded}")
    except AdoError as exc:
        if exc.status_code == 404:
            raise AdoError(f"Project not found: {ado_project.project}. Check the URL.", 404) from exc
        raise
    if not isinstance(project, dict) or not _is_text(project.get("name")) or not _is_text(project.get("id")):
        raise AdoError(UNEXPECTED_RESPONSE)
    name = project["name"]

    nodes = await client.get_json(
        f"{quote(name, safe='')}/_apis/wit/classificationnodes",
        {"$depth": CLASSIFICATION_DEPTH},
    )
    roots = nodes.get("value") if isinstance(nodes, dict) else None
    area = _find_root(roots, "area")
    iteration = _find_root(roots, "iteration")

    return {
        "project": {"id": project["id"], "name": name},
        "projectUrl": f"{ado_project.base_url}/{quote(name, safe='')}",
        "areas": _tree_node(area, with_dates=False),
        "iterations": _tree_node(iteration, with_dates=True),
    }


def _find_root(roots: Any, structure_type: str) -> dict:
    for node in roots if isinstance(roots, list) else []:
        if isinstance(node, dict) and str(node.get("structureType", "")).lower() == structure_type:
            return node
    raise AdoError(UNEXPECTED_RESPONSE)


def _tree_node(root: Any, with_dates: bool) -> dict:
    """One classification node (and its subtree, children in returned order)
    as an AdoTreeNode dict. Iteration nodes get `finishDate` (`YYYY-MM-DD` or "").

    Built iteratively, so a deep tree cannot exhaust the Python stack.

    Raises:
        AdoError: UNEXPECTED_RESPONSE for a malformed node or a tree nested
            more than MAX_TREE_DEPTH levels below the root.
    """
    result = _tree_node_fields(root, with_dates)
    pending = [(root, result, 0)]
    while pending:
        node, converted, depth = pending.pop()
        children = node.get("children")
        children = children if isinstance(children, list) else []
        if children and depth >= MAX_TREE_DEPTH:
            raise AdoError(UNEXPECTED_RESPONSE)
        for child in children:
            child_result = _tree_node_fields(child, with_dates)
            converted["children"].append(child_result)
            pending.append((child, child_result, depth + 1))
    return result


def _tree_node_fields(node: Any, with_dates: bool) -> dict:
    """A node's own fields, with an empty `children` list."""
    if not isinstance(node, dict) or not _is_text(node.get("name")) or not _is_text(node.get("path")):
        raise AdoError(UNEXPECTED_RESPONSE)
    result: dict[str, Any] = {"name": node["name"], "path": normalize_node_path(node["path"])}
    if with_dates:
        attributes = node.get("attributes")
        finish = attributes.get("finishDate") if isinstance(attributes, dict) else None
        result["finishDate"] = _finish_date(finish)
    result["children"] = []
    return result


def _is_text(value: Any) -> bool:
    """A non-empty string that can go into the JSON response (UTF-8 encodable)."""
    return is_utf8_text(value) and bool(value)


def _finish_date(value: Any) -> str:
    """An iteration `finishDate` as `YYYY-MM-DD` (its first 10 chars), or ""
    when those are not a real calendar date."""
    if not is_utf8_text(value) or not _ISO_DATE.fullmatch(value[:10]):
        return ""
    try:
        date.fromisoformat(value[:10])
    except ValueError:
        return ""
    return value[:10]


def scope_field_errors(data: Mapping[str, Any]) -> list[str]:
    """The backlog request's scope check: `scopeType` must be "area" or
    "iteration" and `scopePath` a non-blank string."""
    scope_type, scope_path = data.get("scopeType"), data.get("scopePath")
    if scope_type not in ("area", "iteration") or not isinstance(scope_path, str) or not scope_path.strip():
        return [SCOPE_REQUIRED]
    return []


async def fetch_backlog(client: AdoClient, ado_project: AdoProject, scope_type: str, scope_path: str) -> dict:
    """Fetch the Epics and Features under an Area or Iteration path.

    Follows "ADO REST calls used" in plans/release-plan-ado.md: `connect`
    (validates the PAT and gives both trees), the size field check, the WIQL
    query, `workitemsbatch` in chunks, then parent completion keeping only
    Epics. `scope_path` is matched case-insensitively against the chosen
    tree, and the tree's own spelling is used from then on.

    Args:
        scope_type: "area" or "iteration" (validated by the route).

    Returns:
        The `/api/ado/backlog` payload (see the API contract): work items in
        ascending id order, the flattened iterations and any warnings.

    Raises:
        AdoError: "Unknown <Area|Iteration> path: …" for a path outside the
            tree, UNEXPECTED_RESPONSE for a malformed ADO payload, or any
            error from `connect` / the client.
    """
    connection = await connect(client, ado_project)
    project_segment = quote(connection["project"]["name"], safe="")
    tree = connection["areas"] if scope_type == "area" else connection["iterations"]
    path = find_path(tree, scope_path.strip())
    if path is None:
        raise AdoError(f"Unknown {SCOPE_LABELS[scope_type]} path: {scope_path.strip()}.")

    warnings: list[str] = []
    fields = list(WORK_ITEM_FIELDS)
    if await field_exists(client, SIZE_FIELD):
        fields.append(SIZE_FIELD)
    else:
        warnings.append(SIZE_FIELD_MISSING)

    ids = await query_ids(client, project_segment, wiql_query(SCOPE_FIELDS[scope_type], path))
    if len(ids) >= WIQL_TOP:
        warnings.append(CAP_REACHED)

    items: dict[int, dict] = {}
    for item in await fetch_items(client, project_segment, list(dict.fromkeys(ids)), fields):
        if item["type"] in BACKLOG_TYPES:
            items.setdefault(item["id"], item)
    await _complete_parents(client, project_segment, items, fields)

    return {
        "project": connection["project"],
        "projectUrl": connection["projectUrl"],
        "scope": f"{SCOPE_LABELS[scope_type]} Path: {path}",
        "fetchedAt": _utc_now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "workItems": [items[item_id] for item_id in sorted(items)],
        "iterations": flatten_iterations(connection["iterations"]),
        "warnings": warnings,
    }


def wiql_query(path_field: str, path: str) -> str:
    """The scope WIQL from plans/release-plan-ado.md, with single quotes in
    `path` doubled."""
    escaped = path.replace("'", "''")
    return (
        "SELECT [System.Id] FROM WorkItems\n"
        "WHERE [System.TeamProject] = @project\n"
        "  AND [System.WorkItemType] IN ('Epic','Feature')\n"
        "  AND [System.State] <> 'Removed'\n"
        f"  AND [{path_field}] UNDER '{escaped}'\n"
        "ORDER BY [System.Id]"
    )


def flatten_iterations(root: dict) -> list[dict]:
    """Every node below an Iteration tree root (root excluded), depth-first
    in returned order, as `{path, finishDate}`."""
    result: list[dict] = []
    pending = list(reversed(root["children"]))
    while pending:
        node = pending.pop()
        result.append({"path": node["path"], "finishDate": node.get("finishDate", "")})
        pending.extend(reversed(node["children"]))
    return result


def normalize_work_item(raw: Any) -> dict | None:
    """One `workitemsbatch` entry → an AdoWorkItem dict.

    Missing or non-string text fields become "" and characters that can't be
    UTF-8 encoded are replaced; `size` is trimmed and upper-cased (an integer
    size is kept as its digits); `parentId` is None unless `System.Parent` is
    a positive integer.

    Returns:
        The work item dict, or None for an omitted (null) entry.

    Raises:
        AdoError: UNEXPECTED_RESPONSE for an entry that is not an object, has
            no `fields` object or no positive integer `id`.
    """
    if raw is None:
        return None
    fields = raw.get("fields") if isinstance(raw, dict) else None
    item_id = raw.get("id") if isinstance(raw, dict) else None
    if not isinstance(fields, dict) or not is_id(item_id):
        raise AdoError(UNEXPECTED_RESPONSE)
    size = fields.get(SIZE_FIELD)
    if isinstance(size, int) and not isinstance(size, bool):
        size = str(size)
    parent = fields.get("System.Parent")
    return {
        "id": item_id,
        "type": utf8_text(fields.get("System.WorkItemType")),
        "title": utf8_text(fields.get("System.Title")),
        "state": utf8_text(fields.get("System.State")),
        "description": utf8_text(fields.get("System.Description")),
        "size": utf8_text(size).strip().upper(),
        "iterationPath": utf8_text(fields.get("System.IterationPath")),
        "parentId": parent if is_id(parent) else None,
    }


def find_path(tree: dict, wanted: str) -> str | None:
    """The tree's spelling of the node path `wanted` (case-insensitive), or None."""
    key = wanted.casefold()
    pending = [tree]
    while pending:
        node = pending.pop()
        if node["path"].casefold() == key:
            return node["path"]
        pending.extend(node["children"])
    return None


async def field_exists(client: AdoClient, reference_name: str) -> bool:
    """False when Azure DevOps answers 404 for the field `reference_name`."""
    try:
        await client.get_json(f"_apis/wit/fields/{reference_name}")
    except AdoError as exc:
        if exc.status_code == 404:
            return False
        raise
    return True


async def query_ids(client: AdoClient, project_segment: str, query: str) -> list[int]:
    """Run a WIQL `query` (at most WIQL_TOP results) and return the ids as
    listed (duplicates kept, so the cap check sees the raw count).

    Raises:
        AdoError: UNEXPECTED_RESPONSE when `workItems` is missing or an entry
            has no positive integer `id`.
    """
    result = await client.post_json(
        f"{project_segment}/_apis/wit/wiql",
        {"$top": WIQL_TOP},
        {"query": query},
    )
    refs = result.get("workItems") if isinstance(result, dict) else None
    if not isinstance(refs, list):
        raise AdoError(UNEXPECTED_RESPONSE)
    ids: list[int] = []
    for ref in refs:
        item_id = ref.get("id") if isinstance(ref, dict) else None
        if not is_id(item_id):
            raise AdoError(UNEXPECTED_RESPONSE)
        ids.append(item_id)
    return ids


async def fetch_items(
    client: AdoClient,
    project_segment: str,
    ids: list[int],
    fields: list[str],
    normalize: Callable[[Any], dict | None] = normalize_work_item,
) -> list[dict]:
    """`workitemsbatch` in chunks of at most BATCH_SIZE ids, each entry passed
    through `normalize`; entries it maps to None (e.g. omitted nulls) are skipped.

    Raises:
        AdoError: UNEXPECTED_RESPONSE when a reply has no `value` list, or
            whatever `normalize` raises for a malformed entry (see
            `normalize_work_item`).
    """
    items: list[dict] = []
    for start in range(0, len(ids), BATCH_SIZE):
        result = await client.post_json(
            f"{project_segment}/_apis/wit/workitemsbatch",
            None,
            {"ids": ids[start : start + BATCH_SIZE], "fields": fields, "errorPolicy": "omit"},
        )
        values = result.get("value") if isinstance(result, dict) else None
        if not isinstance(values, list):
            raise AdoError(UNEXPECTED_RESPONSE)
        items.extend(item for item in map(normalize, values) if item is not None)
    return items


async def _complete_parents(client: AdoClient, project_segment: str, items: dict[int, dict], fields: list[str]) -> None:
    """Add the missing parent Epics of `items` in place, up to PARENT_LEVELS
    levels up. Parents of other types are dropped and not followed, and each
    id is requested at most once, so cyclic parent links stop early."""
    requested = set(items)
    added = list(items.values())
    for _ in range(PARENT_LEVELS):
        missing = sorted({item["parentId"] for item in added if item["parentId"] is not None} - requested)
        if not missing:
            return
        requested.update(missing)
        added = []
        for item in await fetch_items(client, project_segment, missing, fields):
            if item["type"] == "Epic" and item["id"] not in items:
                items[item["id"]] = item
                added.append(item)


def is_id(value: Any) -> bool:
    """A positive integer work item id (bool excluded)."""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def utf8_text(value: Any) -> str:
    """A string as UTF-8 safe text (unencodable characters replaced); "" for
    anything that isn't a string."""
    if not isinstance(value, str):
        return ""
    return value.encode("utf-8", "replace").decode("utf-8")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
