/**
 * Storage Service Abstraction
 * Supports both local storage (base64) and Google Cloud Storage (GCS)
 */

export interface StorageConfig {
  provider: "local" | "gcs";
  gcs?: {
    bucketName: string;
    projectId: string;
    keyFilename?: string; // Path to service account key file
    credentials?: {
      client_email: string;
      private_key: string;
    };
  };
}

export interface UploadResult {
  url: string; // Public URL to access the file
  key: string; // Storage key/path (for GCS) or data URL (for local)
  provider: "local" | "gcs";
}

export interface StorageService {
  /**
   * Upload a file buffer to storage
   * @param buffer File buffer
   * @param filename Original filename
   * @param contentType MIME type (e.g., "video/webm", "audio/wav", "image/jpeg")
   * @param folder Optional folder path (e.g., "submissions/audio", "blocks/media")
   * @returns Upload result with URL and key
   */
  uploadFile(
    buffer: Buffer,
    filename: string,
    contentType: string,
    folder?: string
  ): Promise<UploadResult>;

  /**
   * Delete a file from storage
   * @param key Storage key (GCS path or data URL identifier)
   * @returns Success status
   */
  deleteFile(key: string): Promise<boolean>;

  /**
   * Get a public URL for a stored file
   * @param key Storage key
   * @returns Public URL
   */
  getPublicUrl(key: string): string;
}

/**
 * Local Storage Service (current implementation)
 * Stores files as base64 data URLs in the database
 */
export class LocalStorageService implements StorageService {
  async uploadFile(
    buffer: Buffer,
    filename: string,
    contentType: string,
    folder?: string
  ): Promise<UploadResult> {
    // Convert buffer to base64 data URL
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    return {
      url: dataUrl,
      key: dataUrl, // For local storage, key is the data URL itself
      provider: "local",
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    // Local storage doesn't need deletion (data URLs are in database)
    return true;
  }

  getPublicUrl(key: string): string {
    // For local storage, the key IS the URL (data URL)
    return key;
  }
}

/**
 * Google Cloud Storage Service
 */
export class GCSStorageService implements StorageService {
  private bucketName: string;
  private projectId: string;
  private storage: any; // @google-cloud/storage Storage instance

  constructor(config: StorageConfig["gcs"]!) {
    if (!config) {
      throw new Error("GCS configuration is required");
    }

    this.bucketName = config.bucketName;
    this.projectId = config.projectId;

    // Lazy load @google-cloud/storage to avoid requiring it if not using GCS
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Storage } = require("@google-cloud/storage");
      
      if (config.credentials) {
        // Use credentials from config
        this.storage = new Storage({
          projectId: this.projectId,
          credentials: config.credentials,
        });
      } else if (config.keyFilename) {
        // Use key file
        this.storage = new Storage({
          projectId: this.projectId,
          keyFilename: config.keyFilename,
        });
      } else {
        // Use default credentials (for GCP environments)
        this.storage = new Storage({
          projectId: this.projectId,
        });
      }
    } catch (error) {
      console.error("[GCSStorageService] Failed to initialize Google Cloud Storage:", error);
      throw new Error("Google Cloud Storage library not available. Install with: npm install @google-cloud/storage");
    }
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    contentType: string,
    folder?: string
  ): Promise<UploadResult> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      
      // Generate unique filename with timestamp and random string
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const extension = filename.split(".").pop() || "bin";
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const path = folder 
        ? `${folder}/${timestamp}-${randomStr}-${sanitizedFilename}`
        : `${timestamp}-${randomStr}-${sanitizedFilename}`;

      const file = bucket.file(path);

      // Upload file
      await file.save(buffer, {
        metadata: {
          contentType,
          cacheControl: "public, max-age=31536000", // 1 year cache
        },
        public: true, // Make file publicly accessible
      });

      // Get public URL
      const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${path}`;

      return {
        url: publicUrl,
        key: path,
        provider: "gcs",
      };
    } catch (error) {
      console.error("[GCSStorageService] Upload error:", error);
      throw new Error(`Failed to upload file to GCS: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(key);
      await file.delete();
      return true;
    } catch (error) {
      console.error("[GCSStorageService] Delete error:", error);
      return false;
    }
  }

  getPublicUrl(key: string): string {
    // If key is already a full URL, return it
    if (key.startsWith("http://") || key.startsWith("https://")) {
      return key;
    }
    // Otherwise, construct GCS public URL
    return `https://storage.googleapis.com/${this.bucketName}/${key}`;
  }
}

/**
 * Factory function to create the appropriate storage service
 */
export function createStorageService(config: StorageConfig): StorageService {
  if (config.provider === "gcs") {
    if (!config.gcs) {
      throw new Error("GCS configuration is required when provider is 'gcs'");
    }
    return new GCSStorageService(config.gcs);
  } else {
    return new LocalStorageService();
  }
}

/**
 * Get storage service from environment variables
 */
export function getStorageServiceFromEnv(): StorageService {
  const provider = (process.env.STORAGE_PROVIDER || "local") as "local" | "gcs";
  
  if (provider === "gcs") {
    const config: StorageConfig = {
      provider: "gcs",
      gcs: {
        bucketName: process.env.GCS_BUCKET_NAME || "",
        projectId: process.env.GCS_PROJECT_ID || "",
        keyFilename: process.env.GCS_KEY_FILENAME,
        credentials: process.env.GCS_CREDENTIALS
          ? JSON.parse(process.env.GCS_CREDENTIALS)
          : undefined,
      },
    };

    if (!config.gcs.bucketName || !config.gcs.projectId) {
      throw new Error("GCS_BUCKET_NAME and GCS_PROJECT_ID are required when STORAGE_PROVIDER=gcs");
    }

    return createStorageService(config);
  } else {
    return new LocalStorageService();
  }
}

