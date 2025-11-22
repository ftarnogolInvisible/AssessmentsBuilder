# Storage Service Setup Guide

The Assessment Builder supports two storage providers for media files (videos, audio, images):

1. **Local Storage** (default) - Stores files as base64 data URLs in the database
2. **Google Cloud Storage (GCS)** - Stores files in a GCS bucket

## Configuration

### Local Storage (Default)

No configuration needed. Files are stored as base64 data URLs in the database.

```env
STORAGE_PROVIDER=local
```

### Google Cloud Storage

To use GCS, set the following environment variables:

```env
STORAGE_PROVIDER=gcs
GCS_BUCKET_NAME=your-bucket-name
GCS_PROJECT_ID=your-gcp-project-id

# Option 1: Use service account key file
GCS_KEY_FILENAME=/path/to/service-account-key.json

# Option 2: Use service account credentials as JSON string (alternative)
# GCS_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

## Setting Up Google Cloud Storage

### 1. Create a GCS Bucket

```bash
gsutil mb -p YOUR_PROJECT_ID -l us-central1 gs://your-bucket-name
```

### 2. Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **IAM & Admin** > **Service Accounts**
3. Click **Create Service Account**
4. Give it a name (e.g., `assessment-builder-storage`)
5. Grant it the **Storage Admin** role (or **Storage Object Admin** for more restricted access)

### 3. Create and Download Service Account Key

1. Click on the service account you created
2. Go to **Keys** tab
3. Click **Add Key** > **Create new key**
4. Choose **JSON** format
5. Download the key file

### 4. Configure Environment Variables

Add the path to your key file in `.env`:

```env
STORAGE_PROVIDER=gcs
GCS_BUCKET_NAME=your-bucket-name
GCS_PROJECT_ID=your-gcp-project-id
GCS_KEY_FILENAME=/path/to/downloaded-key.json
```

### 5. Make Bucket Public (Optional)

If you want files to be publicly accessible:

```bash
gsutil iam ch allUsers:objectViewer gs://your-bucket-name
```

Or set bucket-level public access:

```bash
gsutil web set -m index.html -e 404.html gs://your-bucket-name
gsutil iam ch allUsers:roles/storage.objectViewer gs://your-bucket-name
```

## Installing Dependencies

If using GCS, install the Google Cloud Storage library:

```bash
npm install @google-cloud/storage
```

## How It Works

### Automatic Upload

When a user submits an assessment with audio/video responses:

1. The client sends the media as a base64 data URL
2. The server receives the submission
3. If `STORAGE_PROVIDER=gcs`, the server automatically:
   - Extracts the base64 data
   - Uploads it to GCS
   - Stores the GCS key in the database
   - Returns the public URL
4. If `STORAGE_PROVIDER=local`, the base64 data URL is stored directly

### File Organization

Files are organized in GCS with the following structure:

```
submissions/
  {submission-id}/
    submission-{submission-id}-block-{block-id}.webm
    submission-{submission-id}-block-{block-id}.wav
```

### API Endpoint

You can also upload files directly via API:

```bash
POST /api/admin/upload
Content-Type: application/json
Authorization: Bearer {token}

{
  "file": "base64-encoded-file-data",
  "filename": "example.webm",
  "contentType": "video/webm",
  "folder": "optional/folder/path"
}
```

Response:
```json
{
  "url": "https://storage.googleapis.com/bucket-name/path/to/file",
  "key": "path/to/file",
  "provider": "gcs"
}
```

## Migration from Local to GCS

To migrate existing submissions from local storage to GCS:

1. Set `STORAGE_PROVIDER=gcs` in your `.env`
2. Create a migration script that:
   - Reads all submissions with `mediaDataUrl`
   - Uploads each to GCS
   - Updates the database with the new GCS key and URL
   - Removes the `mediaDataUrl` to save space

## Benefits of GCS

- **Scalability**: No database size limits for media files
- **Performance**: Faster loading of media files
- **Cost**: More cost-effective for large files
- **CDN**: Can be used with Cloud CDN for global distribution
- **Backup**: Automatic redundancy and versioning

## Current Implementation

- ✅ Storage service abstraction layer
- ✅ Local storage implementation (base64)
- ✅ GCS storage implementation
- ✅ Automatic upload on submission
- ✅ Environment-based configuration
- ✅ Support for audio, video, and image files

## Future Enhancements

- [ ] Direct client-side upload to GCS (signed URLs)
- [ ] Multipart file upload support
- [ ] File deletion when submissions are deleted
- [ ] Migration tool for existing data
- [ ] Support for other storage providers (AWS S3, Azure Blob)

