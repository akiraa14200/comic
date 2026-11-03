import { Capacitor, registerPlugin } from '@capacitor/core';

type LibraryBackupPluginType = {
  chooseFolder(): Promise<{ folderSelected: boolean }>;
  hasFolder(): Promise<{ selected: boolean }>;
  writeBackup(options: { content: string }): Promise<{ saved: boolean; fileName: string }>;
  restoreBackup(): Promise<{ content: string }>;
};

export const LibraryBackup = registerPlugin<LibraryBackupPluginType>('LibraryBackup');
export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const STORAGE_KEYS = ['kairo-watchlist', 'kairo-history', 'rykoc-library-status', 'rykoc-catalogue-mode'];
export function makeLibraryBackup() {
  const data: Record<string, unknown> = {};
  STORAGE_KEYS.forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try { data[key] = JSON.parse(raw); } catch { /* Ignore malformed local values. */ }
    }
  });
  return JSON.stringify({ app: 'RykocCllection', formatVersion: 1, createdAt: new Date().toISOString(), data }, null, 2);
}

let backupTimer: ReturnType<typeof setTimeout> | undefined;
export function scheduleNativeLibraryBackup() {
  if (!isNativeAndroid()) return;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(async () => {
    try {
      const folder = await LibraryBackup.hasFolder();
      if (folder.selected) await LibraryBackup.writeBackup({ content: makeLibraryBackup() });
    } catch (error) {
      console.warn('RykocCllection automatic backup could not be saved:', error);
    }
  }, 900);
}

export function applyLibraryBackup(content: string) {
  if (content.length > 10 * 1024 * 1024) throw new Error('Backup file is too large (10 MB maximum).');
  const parsed = JSON.parse(content);
  if (parsed?.app !== 'RykocCllection' || parsed?.formatVersion !== 1 || !parsed?.data || typeof parsed.data !== 'object') {
    throw new Error('This is not a supported RykocCllection backup.');
  }
  STORAGE_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(parsed.data, key)) localStorage.setItem(key, JSON.stringify(parsed.data[key]));
  });
}
