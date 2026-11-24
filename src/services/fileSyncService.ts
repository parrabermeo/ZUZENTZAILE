import type { BackupPayload } from '../types';
import {
  IDB_HANDLE_KEYS,
  deleteFileHandleFromIdb,
  readFileHandleFromIdb,
  saveFileHandleToIdb,
} from './indexedDbService';

export type FsPermissionMode = 'read' | 'readwrite';
export type FsPermissionState = 'granted' | 'denied' | 'prompt';

export interface LocalFileWritableStream {
  write: (data: string | Blob) => Promise<void>;
  close: () => Promise<void>;
}

export interface LocalFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<LocalFileWritableStream>;
  queryPermission?: (descriptor?: { mode?: FsPermissionMode }) => Promise<FsPermissionState>;
  requestPermission?: (descriptor?: { mode?: FsPermissionMode }) => Promise<FsPermissionState>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface WindowWithFileSystemAccess extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<LocalFileHandle>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<LocalFileHandle[]>;
}

export type PcAutoSaveStatus =
  | 'unsupported'
  | 'unlinked'
  | 'linked-idle'
  | 'saving'
  | 'saved'
  | 'needs-permission'
  | 'error';

export interface PcAutoSaveState {
  supported: boolean;
  status: PcAutoSaveStatus;
  fileName: string | null;
  lastSavedAt: string | null;
  lastError?: string | null;
}

export interface PcAutoSaveWriteResult {
  status: PcAutoSaveStatus;
  fileName: string | null;
  savedAt?: string;
  error?: string;
}

export const MASTER_BACKUP_SUGGESTED_FILENAME = 'ebaluazioa_lh6_master.json';

let activeWriteChain: Promise<unknown> = Promise.resolve();

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as WindowWithFileSystemAccess;
  return typeof win.showSaveFilePicker === 'function';
}

export function isOpenFilePickerSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as WindowWithFileSystemAccess;
  return typeof win.showOpenFilePicker === 'function';
}

async function queryHandleWritePermission(handle: LocalFileHandle): Promise<FsPermissionState> {
  if (typeof handle.queryPermission === 'function') {
    try {
      return await handle.queryPermission({ mode: 'readwrite' });
    } catch {
      return 'prompt';
    }
  }
  return 'granted';
}

async function requestHandleWritePermission(handle: LocalFileHandle): Promise<FsPermissionState> {
  if (typeof handle.requestPermission === 'function') {
    try {
      return await handle.requestPermission({ mode: 'readwrite' });
    } catch {
      return 'denied';
    }
  }
  return 'granted';
}

async function writeJsonToHandle(handle: LocalFileHandle, payload: BackupPayload): Promise<void> {
  const serialized = JSON.stringify(payload, null, 2);
  const writable = await handle.createWritable();
  try {
    await writable.write(serialized);
  } finally {
    await writable.close();
  }
}

/**
 * Inspect whether a physical PC master backup file handle is already persisted in IndexedDB
 * and whether write permission is currently granted or waiting for one-click re-activation.
 */
export async function getLinkedMasterFileState(): Promise<PcAutoSaveState> {
  const supported = isFileSystemAccessSupported();
  if (!supported) {
    return {
      supported: false,
      status: 'unsupported',
      fileName: null,
      lastSavedAt: null,
    };
  }

  const handle = await readFileHandleFromIdb<LocalFileHandle>(IDB_HANDLE_KEYS.MASTER_BACKUP);
  if (!handle) {
    return {
      supported: true,
      status: 'unlinked',
      fileName: null,
      lastSavedAt: null,
    };
  }

  const perm = await queryHandleWritePermission(handle);
  return {
    supported: true,
    status: perm === 'granted' ? 'linked-idle' : 'needs-permission',
    fileName: handle.name || MASTER_BACKUP_SUGGESTED_FILENAME,
    lastSavedAt: null,
  };
}

/**
 * Prompt the teacher with native window.showSaveFilePicker() to choose/create a physical
 * .json master backup file on their PC, store its FileSystemFileHandle in IndexedDB,
 * and immediately write the full current snapshot.
 */
export async function linkMasterBackupFile(payload: BackupPayload): Promise<{
  ok: boolean;
  cancelled?: boolean;
  fileName?: string;
  savedAt?: string;
  error?: string;
}> {
  if (!isFileSystemAccessSupported()) {
    return { ok: false, error: 'File System Access API not supported in this browser' };
  }

  const win = window as WindowWithFileSystemAccess;
  try {
    const handle = await win.showSaveFilePicker!({
      suggestedName: MASTER_BACKUP_SUGGESTED_FILENAME,
      types: [
        {
          description: 'Ebaluazioa LH6 Backup (.json)',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });

    await saveFileHandleToIdb(IDB_HANDLE_KEYS.MASTER_BACKUP, handle);
    await writeJsonToHandle(handle, payload);

    return {
      ok: true,
      fileName: handle.name || MASTER_BACKUP_SUGGESTED_FILENAME,
      savedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Re-authorize an already linked FileSystemFileHandle (e.g. after browser restart)
 * and immediately persist the latest snapshot to disk.
 */
export async function reauthorizeAndWriteMasterFile(
  payload: BackupPayload
): Promise<PcAutoSaveWriteResult> {
  return writeSnapshotToLinkedFile(payload, { requestIfNeeded: true });
}

/**
 * Serialized background write of the full workspace JSON into the linked PC file.
 */
export function writeSnapshotToLinkedFile(
  payload: BackupPayload,
  options?: { requestIfNeeded?: boolean }
): Promise<PcAutoSaveWriteResult> {
  const runWrite = async (): Promise<PcAutoSaveWriteResult> => {
    if (!isFileSystemAccessSupported()) {
      return { status: 'unsupported', fileName: null };
    }

    const handle = await readFileHandleFromIdb<LocalFileHandle>(IDB_HANDLE_KEYS.MASTER_BACKUP);
    if (!handle) {
      return { status: 'unlinked', fileName: null };
    }

    const fileName = handle.name || MASTER_BACKUP_SUGGESTED_FILENAME;
    let perm = await queryHandleWritePermission(handle);

    if (perm !== 'granted') {
      if (options?.requestIfNeeded) {
        perm = await requestHandleWritePermission(handle);
      }
      if (perm !== 'granted') {
        return { status: 'needs-permission', fileName };
      }
    }

    try {
      await writeJsonToHandle(handle, payload);
      return {
        status: 'saved',
        fileName,
        savedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: 'error',
        fileName,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const nextPromise = activeWriteChain.then(runWrite, runWrite);
  activeWriteChain = nextPromise.catch(() => undefined);
  return nextPromise;
}

export async function unlinkMasterBackupFile(): Promise<void> {
  await deleteFileHandleFromIdb(IDB_HANDLE_KEYS.MASTER_BACKUP);
}

/**
 * Open a physical master .json file using native File System Access API when supported.
 * Returns raw JSON text + optional handle so the user can also re-link it if desired.
 */
export async function pickMasterFileWithNativePicker(): Promise<{
  ok: boolean;
  cancelled?: boolean;
  text?: string;
  fileName?: string;
  handle?: LocalFileHandle;
  error?: string;
}> {
  if (!isOpenFilePickerSupported()) {
    return { ok: false, error: 'showOpenFilePicker not supported' };
  }

  const win = window as WindowWithFileSystemAccess;
  try {
    const [handle] = await win.showOpenFilePicker!({
      multiple: false,
      types: [
        {
          description: 'Ebaluazioa LH6 Master (.json)',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    if (!handle) {
      return { ok: false, cancelled: true };
    }
    const file = await handle.getFile();
    const text = await file.text();
    return {
      ok: true,
      text,
      fileName: file.name,
      handle,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Persist a handle picked via showOpenFilePicker as the active auto-save file
 * (only if readwrite permission is granted).
 */
export async function attachHandleAsMasterFile(handle: LocalFileHandle): Promise<boolean> {
  const perm = await requestHandleWritePermission(handle);
  if (perm !== 'granted') return false;
  await saveFileHandleToIdb(IDB_HANDLE_KEYS.MASTER_BACKUP, handle);
  return true;
}
