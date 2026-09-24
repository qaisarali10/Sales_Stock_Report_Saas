import fs from 'node:fs/promises';
import { config } from '../config.js';
import { ParseHistory } from '../models/ParseHistory.js';
import { SavedFile } from '../models/SavedFile.js';
import { isPathInside } from '../utils/fileValidation.js';

export async function cleanupExpiredData() {
  const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000);
  const files = await SavedFile.find({ createdAt: { $lt: cutoff } }).lean();
  for (const file of files) {
    if (isPathInside(config.savedFilesDir, file.storagePath)) await fs.rm(file.storagePath, { force: true }).catch(() => undefined);
    await SavedFile.deleteOne({ _id: file._id });
  }
  // Records imported from the legacy SQLite database (legacyId set) are the
  // historical archive and are kept; only history created by this app expires.
  await ParseHistory.deleteMany({ createdAt: { $lt: cutoff }, legacyId: null });
}

export function startRetentionJob() {
  void cleanupExpiredData().catch((error) => console.error('Retention cleanup failed:', error));
  const timer = setInterval(() => {
    void cleanupExpiredData().catch((error) => console.error('Retention cleanup failed:', error));
  }, 24 * 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
