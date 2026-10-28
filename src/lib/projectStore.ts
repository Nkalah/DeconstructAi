import type { DesignDocument } from '../core/schema/designDocument';
import { deserializeDocument, serializeDocument } from '../core/schema/designDocument';
import { deleteStoredOriginalPoster, getStoredOriginalPoster } from './posterUpload';

const DATABASE_NAME = 'poster-editor-projects';
const DATABASE_VERSION = 1;
const SNAPSHOT_LIMIT = 30;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const ASSET_SCHEME = 'project-asset://';
const ORIGINAL_SCHEME = 'poster-original://';

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  originalAssetId: string | null;
  thumbnailAssetId: string | null;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

interface StoredDocument {
  projectId: string;
  json: string;
  updatedAt: string;
}

interface StoredAsset {
  key: string;
  projectId: string;
  hash: string;
  mimeType: string;
  blob: Blob;
}

interface StoredSnapshot extends ProjectVersion {
  json: string;
}

export interface EncodedDocument {
  document: DesignDocument;
  assets: StoredAsset[];
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('projects')) {
        database.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('documents')) {
        database.createObjectStore('documents', { keyPath: 'projectId' });
      }
      if (!database.objectStoreNames.contains('assets')) {
        const assets = database.createObjectStore('assets', { keyPath: 'key' });
        assets.createIndex('projectId', 'projectId', { unique: false });
      }
      if (!database.objectStoreNames.contains('snapshots')) {
        const snapshots = database.createObjectStore('snapshots', { keyPath: 'id' });
        snapshots.createIndex('projectId', 'projectId', { unique: false });
      }
      if (!database.objectStoreNames.contains('metadata')) {
        database.createObjectStore('metadata', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Could not open local project storage.'));
    };
  });
  return databasePromise;
}

function dataUrlToBlob(uri: string): Blob {
  const match = uri.match(/^data:([^,]*),(.*)$/s);
  if (!match) throw new Error('Generated image asset has an unsupported data URL.');
  const metadata = match[1].split(';');
  const mimeType = metadata[0] || 'application/octet-stream';
  const isBase64 = metadata.slice(1).some((parameter) => parameter.toLowerCase() === 'base64');
  const decoded = isBase64
    ? Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(match[2]));
  const bytes = new Uint8Array(decoded);
  return new Blob([bytes], { type: mimeType });
}

async function hashBlob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure asset storage is unavailable in this browser.');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function encodeDocumentAssets(documentInput: DesignDocument, projectId: string): Promise<EncodedDocument> {
  const document = structuredClone(documentInput);
  const assets: StoredAsset[] = [];
  const originalId = document.originalAsset?.assetId;

  for (const asset of Object.values(document.assets)) {
    const isOriginal = Boolean(originalId && (
      asset.id === originalId
      || asset.name?.includes('(raster fallback)')
      || asset.uri.startsWith('indexeddb://')
    ));
    if (isOriginal && originalId) {
      asset.uri = `${ORIGINAL_SCHEME}${encodeURIComponent(originalId)}`;
      continue;
    }
    let blob: Blob | null = null;
    if (asset.uri.startsWith('data:image/')) {
      blob = dataUrlToBlob(asset.uri);
    } else if (asset.uri.startsWith('blob:')) {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error(`Could not read generated image asset "${asset.name ?? asset.id}".`);
      blob = await response.blob();
    }
    if (!blob) continue;
    const hash = await hashBlob(blob);
    assets.push({
      key: `${projectId}:${hash}`,
      projectId,
      hash,
      mimeType: blob.type || asset.mimeType,
      blob,
    });
    asset.uri = `${ASSET_SCHEME}${hash}`;
  }
  return { document, assets };
}

async function resolveDocumentAssets(documentInput: DesignDocument): Promise<DesignDocument> {
  const document = structuredClone(documentInput);
  const database = await openDatabase();
  const assetRecords = await new Promise<StoredAsset[]>((resolve, reject) => {
    const transaction = database.transaction('assets', 'readonly');
    const request = transaction.objectStore('assets').index('projectId').getAll(document.id);
    request.onsuccess = () => resolve(request.result as StoredAsset[]);
    request.onerror = () => reject(request.error || new Error('Could not read generated assets.'));
  });
  const assetsByHash = new Map(assetRecords.map((record) => [record.hash, record]));
  for (const asset of Object.values(document.assets)) {
    if (asset.uri.startsWith(ASSET_SCHEME)) {
      const hash = asset.uri.slice(ASSET_SCHEME.length);
      const stored = assetsByHash.get(hash);
      if (!stored) throw new Error(`Generated asset "${asset.name ?? asset.id}" is missing from local storage.`);
      asset.uri = URL.createObjectURL(stored.blob);
    } else if (asset.uri.startsWith(ORIGINAL_SCHEME)) {
      const originalId = decodeURIComponent(asset.uri.slice(ORIGINAL_SCHEME.length));
      const original = await getStoredOriginalPoster(originalId);
      if (!original) throw new Error(`The original poster "${asset.name ?? asset.id}" is missing from local storage.`);
      asset.uri = URL.createObjectURL(original.blob);
    }
  }
  return document;
}

function readRequest<T>(request: IDBRequest<T>, fallback: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(fallback));
  });
}

async function getLastActiveProjectId(database?: IDBDatabase): Promise<string | null> {
  const target = database ?? await openDatabase();
  const metadata = await readRequest(
    target.transaction('metadata', 'readonly').objectStore('metadata').get('lastActiveProjectId'),
    'Could not read the most recently active project.',
  ) as { key: string; value: string } | undefined;
  return metadata?.value ?? null;
}

export async function saveLocalProject(
  documentInput: DesignDocument,
  options: { snapshot?: boolean; name?: string } = {},
): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const document = structuredClone(documentInput);
  if (options.name) document.name = options.name;
  document.updatedAt = now;
  const encoded = await encodeDocumentAssets(document, document.id);
  const database = await openDatabase();
  const [existing, priorSnapshot] = await Promise.all([
    readRequest(database.transaction('projects', 'readonly').objectStore('projects').get(document.id), 'Could not read project metadata.'),
    readRequest(
      database.transaction('snapshots', 'readonly').objectStore('snapshots').index('projectId').getAll(document.id),
      'Could not read project history.',
    ),
  ]);
  const oldProject = existing as ProjectRecord | undefined;
  const storedSnapshots = priorSnapshot as StoredSnapshot[];
  const project: ProjectRecord = {
    id: document.id,
    name: document.name,
    createdAt: oldProject?.createdAt ?? document.createdAt,
    updatedAt: now,
    originalAssetId: document.originalAsset?.assetId ?? oldProject?.originalAssetId ?? null,
    thumbnailAssetId: document.layers.find((layer) => layer.type === 'image')?.type === 'image'
      ? (document.layers.find((layer) => layer.type === 'image') as Extract<DesignDocument['layers'][number], { type: 'image' }>).assetId
      : oldProject?.thumbnailAssetId ?? Object.keys(document.assets)[0] ?? null,
  };
  const json = serializeDocument(encoded.document);
  let snapshot: StoredSnapshot | null = null;
  const latestSnapshot = [...storedSnapshots].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const snapshotDue = !latestSnapshot
    || Date.now() - Date.parse(latestSnapshot.createdAt) >= SNAPSHOT_INTERVAL_MS;
  if (options.snapshot || snapshotDue) {
    snapshot = {
      id: `${project.id}:${Date.now()}:${crypto.randomUUID()}`,
      projectId: project.id,
      name: options.snapshot ? 'Manual save' : 'Autosave',
      createdAt: now,
      json,
    };
  }

  const transaction = database.transaction(['projects', 'documents', 'assets', 'snapshots', 'metadata'], 'readwrite');
  const projectStore = transaction.objectStore('projects');
  const documentStore = transaction.objectStore('documents');
  const assetStore = transaction.objectStore('assets');
  const snapshotsStore = transaction.objectStore('snapshots');
  const metadataStore = transaction.objectStore('metadata');
  projectStore.put(project);
  documentStore.put({ projectId: project.id, json, updatedAt: now } satisfies StoredDocument);
  for (const asset of encoded.assets) assetStore.put(asset);
  metadataStore.put({ key: 'lastActiveProjectId', value: project.id });
  if (snapshot) {
    snapshotsStore.put(snapshot);
    const nextSnapshots = [...storedSnapshots, snapshot].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    for (const stale of nextSnapshots.slice(SNAPSHOT_LIMIT)) snapshotsStore.delete(stale.id);
  }
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save project locally.'));
    transaction.onabort = () => reject(transaction.error || new Error('Local project save was interrupted.'));
  });
  return project;
}

export async function listLocalProjects(): Promise<ProjectRecord[]> {
  const database = await openDatabase();
  const projects = await readRequest(database.transaction('projects', 'readonly').objectStore('projects').getAll(), 'Could not list local projects.');
  return (projects as ProjectRecord[]).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function loadLocalProject(projectId: string): Promise<DesignDocument | null> {
  const database = await openDatabase();
  const stored = await readRequest(
    database.transaction('documents', 'readonly').objectStore('documents').get(projectId),
    'Could not load local project.',
  ) as StoredDocument | undefined;
  if (!stored) return null;
  return resolveDocumentAssets(deserializeDocument(stored.json));
}

export async function loadMostRecentLocalProject(): Promise<DesignDocument | null> {
  const projects = await listLocalProjects();
  const lastActiveId = await getLastActiveProjectId();
  const orderedProjects = lastActiveId && projects.some((project) => project.id === lastActiveId)
    ? [projects.find((project) => project.id === lastActiveId)!, ...projects.filter((project) => project.id !== lastActiveId)]
    : projects;

  for (const project of orderedProjects) {
    try {
      const document = await loadLocalProject(project.id);
      if (document) return document;
    } catch {
      continue;
    }
  }
  return null;
}

export async function renameLocalProject(projectId: string, nameInput: string): Promise<ProjectRecord> {
  const name = nameInput.trim().slice(0, 100);
  if (!name) throw new Error('Project name cannot be empty.');
  const database = await openDatabase();
  const transaction = database.transaction(['projects', 'documents'], 'readwrite');
  const projectStore = transaction.objectStore('projects');
  const documentStore = transaction.objectStore('documents');
  const project = await readRequest(projectStore.get(projectId), 'Could not read project metadata.') as ProjectRecord | undefined;
  const stored = await readRequest(documentStore.get(projectId), 'Could not read project document.') as StoredDocument | undefined;
  if (!project || !stored) throw new Error('Project not found.');
  project.name = name;
  project.updatedAt = new Date().toISOString();
  const document = deserializeDocument(stored.json);
  document.name = name;
  document.updatedAt = project.updatedAt;
  projectStore.put(project);
  documentStore.put({ ...stored, json: serializeDocument(document), updatedAt: project.updatedAt });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not rename project.'));
  });
  return project;
}

export async function duplicateLocalProject(projectId: string): Promise<DesignDocument> {
  const original = await loadLocalProject(projectId);
  if (!original) throw new Error('Project not found.');
  const duplicate = structuredClone(original);
  const now = new Date().toISOString();
  duplicate.id = crypto.randomUUID();
  duplicate.name = `${original.name} copy`;
  duplicate.createdAt = now;
  duplicate.updatedAt = now;
  duplicate.version = 1;
  const layerIds = new Map(duplicate.layers.map((layer) => [layer.id, `${layer.id}-copy-${crypto.randomUUID().slice(0, 8)}`]));
  for (const layer of duplicate.layers) {
    layer.id = layerIds.get(layer.id)!;
    if (layer.type === 'group') layer.childIds = layer.childIds.map((id) => layerIds.get(id) ?? id);
    else if (layer.groupId && layerIds.has(layer.groupId)) layer.groupId = layerIds.get(layer.groupId);
  }
  await saveLocalProject(duplicate, { snapshot: true });
  return duplicate;
}

export async function deleteLocalProject(projectId: string): Promise<void> {
  const projects = await listLocalProjects();
  const target = projects.find((project) => project.id === projectId);
  if (!target) return;
  const database = await openDatabase();
  const remainingProjects = projects.filter((project) => project.id !== projectId);
  const lastActiveProjectId = await getLastActiveProjectId(database);
  const nextActiveProjectId = lastActiveProjectId === projectId
    ? remainingProjects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id ?? null
    : lastActiveProjectId && remainingProjects.some((project) => project.id === lastActiveProjectId)
      ? lastActiveProjectId
      : remainingProjects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id ?? null;
  const transaction = database.transaction(['projects', 'documents', 'assets', 'snapshots', 'metadata'], 'readwrite');
  transaction.objectStore('projects').delete(projectId);
  transaction.objectStore('documents').delete(projectId);
  const metadataStore = transaction.objectStore('metadata');
  if (nextActiveProjectId) {
    metadataStore.put({ key: 'lastActiveProjectId', value: nextActiveProjectId });
  } else {
    metadataStore.delete('lastActiveProjectId');
  }
  const assetIndex = transaction.objectStore('assets').index('projectId');
  const assetCursor = assetIndex.openKeyCursor(IDBKeyRange.only(projectId));
  assetCursor.onsuccess = () => {
    const cursor = assetCursor.result;
    if (cursor) {
      transaction.objectStore('assets').delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  const snapshotIndex = transaction.objectStore('snapshots').index('projectId');
  const snapshotCursor = snapshotIndex.openKeyCursor(IDBKeyRange.only(projectId));
  snapshotCursor.onsuccess = () => {
    const cursor = snapshotCursor.result;
    if (cursor) {
      transaction.objectStore('snapshots').delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not delete project assets.'));
    transaction.onabort = () => reject(transaction.error || new Error('Project deletion was interrupted.'));
  });
  if (target.originalAssetId && !projects.some((project) => project.id !== projectId && project.originalAssetId === target.originalAssetId)) {
    await deleteStoredOriginalPoster(target.originalAssetId);
  }
}

export async function getProjectVersions(projectId: string): Promise<ProjectVersion[]> {
  const database = await openDatabase();
  const snapshots = await readRequest(
    database.transaction('snapshots', 'readonly').objectStore('snapshots').index('projectId').getAll(projectId),
    'Could not load project versions.',
  ) as StoredSnapshot[];
  return snapshots
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(({ id, projectId: owner, name, createdAt }) => ({ id, projectId: owner, name, createdAt }));
}

export async function loadProjectVersion(snapshotId: string): Promise<DesignDocument | null> {
  const database = await openDatabase();
  const stored = await readRequest(
    database.transaction('snapshots', 'readonly').objectStore('snapshots').get(snapshotId),
    'Could not load project version.',
  ) as StoredSnapshot | undefined;
  return stored ? resolveDocumentAssets(deserializeDocument(stored.json)) : null;
}

export async function getProjectThumbnail(project: ProjectRecord): Promise<string | null> {
  if (project.originalAssetId) {
    const original = await getStoredOriginalPoster(project.originalAssetId);
    if (original) return URL.createObjectURL(original.blob);
  }
  if (!project.thumbnailAssetId) return null;
  const database = await openDatabase();
  const storedDocument = await readRequest(
    database.transaction('documents', 'readonly').objectStore('documents').get(project.id),
    'Could not read the project thumbnail reference.',
  ) as StoredDocument | undefined;
  if (!storedDocument) return null;
  const document = deserializeDocument(storedDocument.json);
  const asset = document.assets[project.thumbnailAssetId];
  if (!asset) return null;
  if (asset.uri.startsWith(ASSET_SCHEME)) {
    const hash = asset.uri.slice(ASSET_SCHEME.length);
    const storedAsset = await readRequest(
      database.transaction('assets', 'readonly').objectStore('assets').get(`${project.id}:${hash}`),
      'Could not read the project thumbnail.',
    ) as StoredAsset | undefined;
    return storedAsset ? URL.createObjectURL(storedAsset.blob) : null;
  }
  if (asset.uri.startsWith('data:image/')) return URL.createObjectURL(dataUrlToBlob(asset.uri));
  return null;
}
