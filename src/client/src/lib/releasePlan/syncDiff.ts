import type { AdoBacklog, AdoConnection, AdoWorkItem } from "./adoTypes";
import { ADO_SYSTEM, groupBacklog } from "./fromBacklog";
import { NO_EPIC_ID, NO_EPIC_TITLE, type Epic, type Feature, type Iteration, type PlanSource, type ReleasePlan, type WorkItemId } from "./types";

/** Epic fields Sync updates from Azure DevOps. */
export type EpicField = "title" | "state" | "description";
/** Feature fields Sync updates; `"epic"` = the parent Epic changed (the Feature moves). */
export type FeatureField = "title" | "state" | "description" | "size" | "iterationPath" | "epic";

/** A work item listed in the sync preview. */
export interface SyncItem {
  id: WorkItemId;
  title: string;
}

/** A Feature that will be added (Unplanned, at the end of `epicId`'s columns). */
export interface SyncNewFeature extends SyncItem {
  /** The board id of its target Epic (an existing one, a new one, or {@link NO_EPIC_ID}). */
  epicId: WorkItemId;
  /** Title of the target Epic (as it will read after the sync). */
  epicTitle: string;
}

/** An existing item whose fields differ from Azure DevOps (`title` is the new title). */
export interface SyncUpdate<F extends string> extends SyncItem {
  changes: F[];
}

/**
 * What a sync would change, computed by {@link diffBacklog}. Items are matched
 * by `String(id)`; the synthetic {@link NO_EPIC_ID} Epic is never listed.
 */
export interface SyncDiff {
  newEpics: SyncItem[];
  newFeatures: SyncNewFeature[];
  updatedEpics: SyncUpdate<EpicField>[];
  updatedFeatures: SyncUpdate<FeatureField>[];
  /** On the board but no longer in the fetched scope. */
  goneEpics: SyncItem[];
  goneFeatures: SyncItem[];
  /** The fetched iteration list differs from `plan.iterations`. */
  iterationsChanged: boolean;
}

/** {@link applySync} options. */
export interface ApplySyncOptions {
  /** Remove the Epics/Features no longer in scope ("Remove items no longer in scope"). */
  removeGone: boolean;
}

const EPIC_FIELDS: readonly EpicField[] = ["title", "state", "description"];
const FEATURE_FIELDS: readonly Exclude<FeatureField, "epic">[] = ["title", "state", "description", "size", "iterationPath"];

const key = (id: WorkItemId): string => String(id);

/** Backlog values as stored on the board (sizes trimmed and upper-cased, like `normalizePlan`). */
function featureValues(item: AdoWorkItem): Pick<Feature, Exclude<FeatureField, "epic">> {
  return {
    title: item.title,
    state: item.state,
    description: item.description,
    size: item.size.trim().toUpperCase(),
    iterationPath: item.iterationPath,
  };
}

function sameIterations(a: readonly Iteration[], b: readonly Iteration[]): boolean {
  return a.length === b.length && a.every((it, i) => it.path === b[i].path && it.finishDate === b[i].finishDate);
}

/** Where a fetched Feature belongs: its parent Epic's id (as a string), or the synthetic Epic. */
interface Placement {
  item: AdoWorkItem;
  /** `String(epic id)` of the target Epic, or {@link NO_EPIC_ID}. */
  epicKey: string;
}

/** The match between a plan and a backlog, shared by {@link diffBacklog} and {@link applySync}. */
interface SyncMatch {
  /** Fetched Epics in id order. */
  backlogEpics: AdoWorkItem[];
  /** Fetched Features in id order with their target Epic. */
  placements: Placement[];
  backlogEpicKeys: Set<string>;
  backlogFeatureKeys: Set<string>;
  /** Board Epic (not synthetic) by `String(id)`. */
  boardEpics: Map<string, Epic>;
  /** Board Feature by `String(id)` with the `String(id)` of the Epic holding it. */
  boardFeatures: Map<string, { feature: Feature; epicKey: string }>;
}

function match(plan: ReleasePlan, backlog: AdoBacklog): SyncMatch {
  const { epics: groups, orphans } = groupBacklog(backlog.workItems);
  const placements: Placement[] = [
    ...groups.flatMap(({ epic, features }) => features.map((item) => ({ item, epicKey: key(epic.id) }))),
    ...orphans.map((item) => ({ item, epicKey: NO_EPIC_ID })),
  ].sort((a, b) => a.item.id - b.item.id);
  const boardEpics = new Map<string, Epic>();
  const boardFeatures = new Map<string, { feature: Feature; epicKey: string }>();
  for (const epic of plan.epics) {
    if (key(epic.id) !== NO_EPIC_ID && !boardEpics.has(key(epic.id))) {
      boardEpics.set(key(epic.id), epic);
    }
    for (const feature of epic.features) {
      if (!boardFeatures.has(key(feature.id))) {
        boardFeatures.set(key(feature.id), { feature, epicKey: key(epic.id) });
      }
    }
  }
  return {
    backlogEpics: groups.map((g) => g.epic),
    placements,
    backlogEpicKeys: new Set(groups.map((g) => key(g.epic.id))),
    backlogFeatureKeys: new Set(placements.map((p) => key(p.item.id))),
    boardEpics,
    boardFeatures,
  };
}

/**
 * Compares the board with a fetched backlog: new / updated / moved / gone
 * Epics and Features (matched by `String(id)`, so string ids from old JSON
 * files match numeric ADO ids) and whether the iterations changed. Orphan
 * Features (no parent, or a parent that isn't a fetched Epic) belong to the
 * synthetic Epic, exactly as in `groupBacklog`; that Epic itself is never listed.
 */
export function diffBacklog(plan: ReleasePlan, backlog: AdoBacklog): SyncDiff {
  const m = match(plan, backlog);
  const epicTitle = (epicKey: string): string => {
    if (epicKey === NO_EPIC_ID) {
      return NO_EPIC_TITLE;
    }
    return m.backlogEpics.find((e) => key(e.id) === epicKey)?.title ?? epicKey;
  };
  const epicBoardId = (epicKey: string): WorkItemId => {
    if (epicKey === NO_EPIC_ID) {
      return NO_EPIC_ID;
    }
    return m.boardEpics.get(epicKey)?.id ?? m.backlogEpics.find((e) => key(e.id) === epicKey)?.id ?? epicKey;
  };

  const newEpics: SyncItem[] = [];
  const updatedEpics: SyncUpdate<EpicField>[] = [];
  for (const item of m.backlogEpics) {
    const epic = m.boardEpics.get(key(item.id));
    if (!epic) {
      newEpics.push({ id: item.id, title: item.title });
      continue;
    }
    const changes = EPIC_FIELDS.filter((f) => epic[f] !== item[f]);
    if (changes.length > 0) {
      updatedEpics.push({ id: epic.id, title: item.title, changes });
    }
  }

  const newFeatures: SyncNewFeature[] = [];
  const updatedFeatures: SyncUpdate<FeatureField>[] = [];
  for (const { item, epicKey } of m.placements) {
    const current = m.boardFeatures.get(key(item.id));
    if (!current) {
      newFeatures.push({ id: item.id, title: item.title, epicId: epicBoardId(epicKey), epicTitle: epicTitle(epicKey) });
      continue;
    }
    const values = featureValues(item);
    const changes: FeatureField[] = FEATURE_FIELDS.filter((f) => current.feature[f] !== values[f]);
    if (current.epicKey !== epicKey) {
      changes.push("epic");
    }
    if (changes.length > 0) {
      updatedFeatures.push({ id: current.feature.id, title: item.title, changes });
    }
  }

  const goneEpics = [...m.boardEpics.values()]
    .filter((e) => !m.backlogEpicKeys.has(key(e.id)))
    .map((e) => ({ id: e.id, title: e.title }));
  const goneFeatures = [...m.boardFeatures.values()]
    .filter(({ feature }) => !m.backlogFeatureKeys.has(key(feature.id)))
    .map(({ feature }) => ({ id: feature.id, title: feature.title }));

  return {
    newEpics,
    newFeatures,
    updatedEpics,
    updatedFeatures,
    goneEpics,
    goneFeatures,
    iterationsChanged: !sameIterations(plan.iterations, backlog.iterations),
  };
}

/** Whether the diff has no work item changes (the iterations may still differ). */
export function isDiffEmpty(diff: SyncDiff): boolean {
  return (
    diff.newEpics.length +
      diff.newFeatures.length +
      diff.updatedEpics.length +
      diff.updatedFeatures.length +
      diff.goneEpics.length +
      diff.goneFeatures.length ===
    0
  );
}

const SOURCE_KEYS = ["system", "project", "scope", "fetchedAt", "kind", "projectUrl", "scopeType", "scopePath"] as const;

function syncedSource(backlog: AdoBacklog, connection: AdoConnection): PlanSource {
  return {
    system: ADO_SYSTEM,
    project: backlog.project.name,
    scope: backlog.scope,
    fetchedAt: backlog.fetchedAt,
    kind: connection.source,
    projectUrl: connection.projectUrl,
    scopeType: connection.scopeType,
    scopePath: connection.scopePath,
  };
}

function updateFeature(feature: Feature, item: AdoWorkItem): Feature {
  const values = featureValues(item);
  return FEATURE_FIELDS.some((f) => feature[f] !== values[f]) ? { ...feature, ...values } : feature;
}

/**
 * The plan after a sync (pure; the inputs are never mutated):
 * - Epic title/state/description and Feature title/state/description/size/
 *   iterationPath take the fetched values;
 * - a Feature whose parent Epic changed moves to the end of the new Epic's
 *   columns and keeps its `milestoneId`;
 * - new Features are added Unplanned (`milestoneId: null`) at the end of their
 *   Epic's columns, in id order; new Epics are appended on the right, in id order;
 * - the synthetic Epic is created (last) when orphan Features appear, stays last
 *   when it was last, and is removed when it ends up empty;
 * - Epics/Features no longer in scope are removed only with `removeGone`
 *   (nothing else references a Feature: flags point at milestones);
 * - `iterations` are replaced and `source` gets the backlog's project, scope,
 *   fetch time and the connection (never the PAT).
 * Milestones, flags, mode, name and the order of unchanged items are kept.
 * Returns `plan` itself when nothing at all changes. The result passes
 * `normalizePlan` unchanged.
 */
export function applySync(plan: ReleasePlan, backlog: AdoBacklog, connection: AdoConnection, { removeGone }: ApplySyncOptions): ReleasePlan {
  const m = match(plan, backlog);
  const backlogEpicByKey = new Map(m.backlogEpics.map((e) => [key(e.id), e]));
  const placementByKey = new Map(m.placements.map((p) => [key(p.item.id), p]));

  // 1. Existing Epics, in board order: field updates; Features that stay (updated), are gone, or move away.
  interface Column {
    epic: Epic;
    epicKey: string;
    features: Feature[];
  }
  const kept: Column[] = [];
  /** Where Features of an Epic are appended: the first column with that id. */
  const targets = new Map<string, Column>();
  for (const epic of plan.epics) {
    const epicKey = key(epic.id);
    const features: Feature[] = [];
    for (const feature of epic.features) {
      if (m.boardFeatures.get(key(feature.id))?.feature !== feature) {
        features.push(feature); // a duplicate id (hand-edited file) is left as it is
        continue;
      }
      const placement = placementByKey.get(key(feature.id));
      if (placement === undefined) {
        if (!removeGone) {
          features.push(feature);
        }
      } else if (placement.epicKey === epicKey) {
        features.push(updateFeature(feature, placement.item));
      }
      // Otherwise it moves to another Epic (appended in step 3).
    }
    if (removeGone && epicKey !== NO_EPIC_ID && !backlogEpicByKey.has(epicKey)) {
      continue;
    }
    const column = { epic, epicKey, features };
    kept.push(column);
    if (!targets.has(epicKey)) {
      targets.set(epicKey, column);
    }
  }

  // 2. New Epics, in id order, and the synthetic Epic when orphans need it.
  const added: Column[] = m.backlogEpics
    .filter((e) => !m.boardEpics.has(key(e.id)))
    .map((e) => ({ epic: { id: e.id, title: e.title, state: e.state, description: e.description, features: [] }, epicKey: key(e.id), features: [] }));
  for (const column of added) {
    targets.set(column.epicKey, column);
  }
  let synthetic = targets.get(NO_EPIC_ID);
  const syntheticWasLast = synthetic !== undefined && kept[kept.length - 1] === synthetic;
  if (!synthetic && m.placements.some((p) => p.epicKey === NO_EPIC_ID)) {
    synthetic = { epic: { id: NO_EPIC_ID, title: NO_EPIC_TITLE, state: "", description: "", features: [] }, epicKey: NO_EPIC_ID, features: [] };
    targets.set(NO_EPIC_ID, synthetic);
  }

  // 3. New and moved Features, in id order, at the end of their Epic.
  for (const { item, epicKey } of m.placements) {
    const current = m.boardFeatures.get(key(item.id));
    if (current?.epicKey === epicKey) {
      continue;
    }
    // Every placement's Epic is kept, added or synthetic, so the target exists.
    targets.get(epicKey)?.features.push(
      current
        ? updateFeature(current.feature, item)
        : { id: item.id, ...featureValues(item), milestoneId: null },
    );
  }

  // 4. Assemble: kept Epics (the synthetic one moved last when it was last), new Epics, then a new synthetic Epic.
  const order = [...kept];
  if (synthetic && (syntheticWasLast || !kept.includes(synthetic))) {
    const i = order.indexOf(synthetic);
    if (i >= 0) {
      order.splice(i, 1);
    }
    order.push(...added, synthetic);
  } else {
    order.push(...added);
  }
  const epics: Epic[] = [];
  for (const { epic, epicKey, features } of order) {
    if (epicKey === NO_EPIC_ID && features.length === 0) {
      continue;
    }
    const item = epicKey === NO_EPIC_ID ? undefined : backlogEpicByKey.get(epicKey);
    const fields = item ? { title: item.title, state: item.state, description: item.description } : null;
    const fieldsChanged = fields !== null && EPIC_FIELDS.some((f) => epic[f] !== fields[f]);
    const featuresChanged = features.length !== epic.features.length || features.some((f, i) => f !== epic.features[i]);
    epics.push(fieldsChanged || featuresChanged ? { ...epic, ...fields, features: featuresChanged ? features : epic.features } : epic);
  }

  const source = syncedSource(backlog, connection);
  const iterations = backlog.iterations.map(({ path, finishDate }) => ({ path, finishDate }));
  const epicsSame = epics.length === plan.epics.length && epics.every((e, i) => e === plan.epics[i]);
  const sourceSame = SOURCE_KEYS.every((k) => plan.source[k] === source[k]) && Object.keys(plan.source).length === SOURCE_KEYS.length;
  const iterationsSame = sameIterations(plan.iterations, iterations);
  if (epicsSame && sourceSame && iterationsSame) {
    return plan;
  }
  return {
    ...plan,
    source,
    iterations: iterationsSame ? plan.iterations : iterations,
    epics: epicsSame ? plan.epics : epics,
  };
}
