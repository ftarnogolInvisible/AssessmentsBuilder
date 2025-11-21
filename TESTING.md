# Testing Guide

## Quick Start Testing

### 1. Start Everything

```bash
cd /Users/ftarnogol/AssessmentsBuilder/AssessmentBuilder

# Install dependencies (first time only)
npm install

# Start database
npm run db:up

# Wait 5-10 seconds for database to be ready, then create tables
npm run db:push

# Create .env file
cp env.example .env

# Start development server
npm run dev
```

The server will start on `http://localhost:5000`

## What You Can Test Right Now

### 1. Health Check Endpoint
Test that the server is running:

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-..."
}
```

### 2. Frontend Pages

Open in your browser:

- **Admin Dashboard**: `http://localhost:5000/admin`
  - Currently shows a placeholder page
  - Will be the main assessment builder interface

- **Assessment Page**: `http://localhost:5000/assessment/test-url`
  - Currently shows a placeholder
  - This is where end users will complete assessments

- **404 Page**: `http://localhost:5000/anything-else`
  - Shows the not found page

### 3. Database Connection

Verify database is working:

```bash
# Check if container is running
docker ps

# View database logs
npm run db:logs

# Open Drizzle Studio (database GUI)
npm run db:studio
```

Drizzle Studio will open at `http://localhost:4983` where you can browse tables and data.

### 4. API Endpoints (Currently Available)

#### Public Endpoints:

**Health Check**
```bash
GET http://localhost:5000/api/health
```

**Get Assessment** (requires a published assessment)
```bash
GET http://localhost:5000/api/assessment/{publicUrl}
```

**Submit Assessment** (requires a published assessment)
```bash
POST http://localhost:5000/api/assessment/{publicUrl}/submit
Content-Type: application/json

{
  "email": "test@example.com",
  "name": "Test User",
  "responses": []
}
```

#### Admin Endpoints (Require Authentication):

**Get Campaigns**
```bash
GET http://localhost:5000/api/admin/campaigns
Authorization: Bearer {token}
```

## Current Limitations

Since we're in Phase 1, the following are not yet implemented:

- ❌ User authentication/login
- ❌ Assessment builder UI
- ❌ Block creation/editing
- ❌ Assessment publishing
- ❌ Submission review interface

## Next Steps for Full Testing

To test the full flow, we need to:

1. **Create a test client and user** (via database or API)
2. **Create a campaign** (via API)
3. **Create a project** (via API)
4. **Create an assessment** (via API)
5. **Add blocks** (via API)
6. **Publish assessment** (via API)
7. **Test submission** (via public endpoint)

Or wait for Phase 2 where we'll build the UI for all of this!

## Troubleshooting

### Port Already in Use
If port 5000 is taken:
```bash
# Edit .env file and change PORT=5000 to another port
PORT=5001
```

### Database Connection Error
```bash
# Make sure database is running
npm run db:up

# Wait a few seconds, then check logs
npm run db:logs

# Verify DATABASE_URL in .env matches docker-compose.yml
```

### Cannot Find Module Errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

