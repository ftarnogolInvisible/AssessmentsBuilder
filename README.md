# Assessment Builder Platform

A web platform where admins build modular assessments using drag and drop blocks. End users receive a unique link to complete each assessment. Admins can review user submissions and optionally grade them. The platform exposes endpoints compatible with n8n for automated AI evaluation.

## Features

- **Assessment Builder**: Drag-and-drop interface for creating assessments
- **Block Types**: Multiple choice, multi-select, audio response, video response, media stimulus
- **Campaigns & Projects**: Hierarchical organization system
- **Assessment Delivery**: Public URLs for end users to complete assessments
- **Admin Review Dashboard**: Review submissions, grade responses, export data
- **API Integration**: n8n-compatible endpoints and webhooks

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (via Neon)
- **ORM**: Drizzle ORM
- **Storage**: S3-compatible storage
- **UI**: Radix UI + Tailwind CSS

## Getting Started

1. **Prerequisites:**
   - Node.js 18+ installed
   - Docker Desktop installed and running

2. **Install dependencies:**
```bash
npm install
```

3. **Start PostgreSQL database with Docker:**
```bash
npm run db:up
```
This will start a PostgreSQL container on port 5432.

4. **Set up environment variables:**
```bash
cp env.example .env
```
The default `.env` is already configured for the Docker database. No changes needed unless you want to use a different database.

5. **Run database migrations:**
```bash
npm run db:push
```
This will create all the required tables in your database.

6. **Start development server:**
```bash
npm run dev
```

### Database Management Commands

- `npm run db:up` - Start the database container
- `npm run db:down` - Stop the database container
- `npm run db:logs` - View database logs
- `npm run db:reset` - Reset database (removes all data)
- `npm run db:studio` - Open Drizzle Studio (database GUI)

### Using a Different Database

If you prefer to use Neon, Supabase, or another PostgreSQL provider:

1. Update `DATABASE_URL` in your `.env` file
2. Skip the `npm run db:up` step
3. Run `npm run db:push` to create tables

## Project Structure

```
AssessmentBuilder/
├── client/          # Frontend React application
├── server/          # Backend Express API
├── shared/          # Shared types and schemas
├── migrations/      # Database migrations
└── package.json
```

## Development Phases

- ✅ Phase 1: Database schema and API foundation
- ⏳ Phase 2: Assessment Builder UI
- ⏳ Phase 3: Assessment Delivery Frontend
- ⏳ Phase 4: Admin Review Dashboard
- ⏳ Phase 5: API Integration & Webhooks

