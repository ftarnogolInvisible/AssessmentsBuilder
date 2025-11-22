/**
 * Storage Service Singleton
 * Provides access to the configured storage service (local or GCS)
 */

import { StorageService, getStorageServiceFromEnv } from "./storageService";

let storageServiceInstance: StorageService | null = null;

/**
 * Get the storage service instance (singleton)
 */
export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    storageServiceInstance = getStorageServiceFromEnv();
    console.log(`[Storage] Initialized ${storageServiceInstance.constructor.name}`);
  }
  return storageServiceInstance;
}

/**
 * Reset the storage service instance (useful for testing)
 */
export function resetStorageService(): void {
  storageServiceInstance = null;
}

