# Assessment Builder Platform

A comprehensive web platform for building and delivering modular assessments. Admins create assessments using an intuitive drag-and-drop interface with multiple block types. End users receive unique links to complete assessments, and admins can review submissions, grade responses, and export data. The platform includes API endpoints compatible with n8n for automated AI evaluation.

## ✨ Features

### Assessment Builder
- **Drag-and-Drop Interface**: Intuitive block-based assessment creation
- **Block Types**: 
  - Multiple choice (single correct answer)
  - Multi-select (multiple correct answers)
  - Free text responses
  - Audio response recording
  - Video response recording (720p)
  - Media stimulus (image/video/audio)
- **Block Configuration**: Title, instructions, required toggle, time limits, scoring
- **Preview Mode**: Full-screen preview with progress tracking
- **Versioning**: Draft and published states for assessments

### Assessment Delivery
- **Public URLs**: Unique links for each published assessment
- **Media Recording**: Built-in audio and video recording with WebRTC
- **Progress Tracking**: Visual progress indicators
- **Autosave**: Automatic saving of responses

### Admin Dashboard
- **Project Management**: Hierarchical organization (Campaigns → Projects → Assessments)
- **Submission Review**: Review and grade user submissions
- **Media Playback**: Playback audio and video responses
- **Export**: Export submission data (CSV/JSON)

### API & Integration
- **RESTful API**: Complete API for all platform features
- **n8n Compatibility**: Endpoints designed for workflow automation
- **Webhooks**: Event-driven webhook system
- **API Keys**: Secure API key management

## 🛠 Tech Stack

- **Frontend**: React 18 + Vite + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (Docker or hosted)
- **ORM**: Drizzle ORM
- **Storage**: S3-compatible storage (optional)
- **UI Components**: Radix UI + Tailwind CSS
- **Drag & Drop**: @dnd-kit
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Forms**: React Hook Form + Zod validation

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- Docker Desktop installed and running (for local database)
- npm or yarn package manager

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd AssessmentBuilder
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
```bash
cp env.example .env
```
The default `.env` is configured for Docker. Edit if using a different database.

4. **Start PostgreSQL database with Docker:**
```bash
npm run db:up
```
This starts a PostgreSQL container on port 5433.

5. **Run database migrations:**
```bash
npm run db:push
```
This creates all required tables in your database.

6. **Start development server:**
```bash
npm run dev
```

The application will be available at `http://localhost:5000` (or your configured PORT).

### Database Management Commands

- `npm run db:up` - Start the database container
- `npm run db:down` - Stop the database container
- `npm run db:logs` - View database logs
- `npm run db:reset` - Reset database (removes all data)
- `npm run db:studio` - Open Drizzle Studio (database GUI)
- `npm run db:clear` - Clear all data (keeps tables)

### Using a Different Database

To use Neon, Supabase, or another PostgreSQL provider:

1. Update `DATABASE_URL` in your `.env` file
2. Skip the `npm run db:up` step
3. Run `npm run db:push` to create tables

## 📁 Project Structure

```
AssessmentBuilder/
├── client/                    # Frontend React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/         # Admin dashboard components
│   │   │   ├── assessment/    # Assessment taking components
│   │   │   ├── builder/       # Assessment builder components
│   │   │   ├── review/        # Review dashboard components
│   │   │   └── ui/            # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── lib/               # Utilities and config
│   │   └── App.tsx            # Main app component
│   └── index.html
├── server/                     # Backend Express API
│   ├── middleware/            # Auth, security middleware
│   ├── db.ts                  # Database connection
│   ├── storage.ts             # Data access layer
│   ├── routes.ts              # API routes
│   ├── vite.ts                # Vite integration
│   └── index.ts               # Server entry point
├── shared/                     # Shared types and schemas
│   └── schema.ts              # Database schema definitions
├── scripts/                    # Utility scripts
├── docker-compose.yml          # Docker configuration
├── drizzle.config.ts           # Drizzle ORM config
├── vite.config.ts              # Vite configuration
├── tailwind.config.ts          # Tailwind CSS config
└── package.json
```

## 📊 Development Phases

### ✅ Phase 1: Foundations - COMPLETED
- ✅ Database schema (campaigns, projects, assessments, blocks, submissions, API keys)
- ✅ Server infrastructure (Express API, database connection, storage layer)
- ✅ Authentication & security middleware
- ✅ Docker setup for PostgreSQL
- ✅ Basic API routes
- ✅ Client infrastructure (React + Vite + TypeScript)

### ✅ Phase 2: Assessment Builder UI - COMPLETED
- ✅ Drag-and-drop interface with @dnd-kit
- ✅ Block sidebar with all block types
- ✅ Builder canvas with reordering
- ✅ Block configuration modal and form
- ✅ Visual block preview cards
- ✅ Preview mode with progress tracking
- ✅ Audio and video recording components
- ✅ API integration for persistence
- ✅ Publish/unpublish functionality

### ✅ Phase 3: Assessment Delivery Frontend - COMPLETED
- ✅ User-facing assessment completion page
- ✅ Media recording components (WebRTC)
- ✅ File upload handling
- ✅ Autosave functionality
- ✅ Progress tracking

### ✅ Phase 4: Admin Review Dashboard - COMPLETED
- ✅ Enhanced submission review interface
- ✅ Media playback components
- ✅ Scoring interface
- ✅ Internal notes
- ✅ Export functionality (CSV/JSON)

### ⏳ Phase 5: API Integration & Webhooks - IN PROGRESS
- ⏳ Complete API routes for all entities
- ⏳ Webhook trigger implementation
- ⏳ n8n-compatible endpoints
- ⏳ API key authentication middleware
- ⏳ Webhook retry logic

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run check` - Type check without emitting
- `npm run kill-port` - Kill process on port 5000
- `npm run set-port` - Update port configuration

## 🔐 Environment Variables

Key environment variables (see `env.example` for full list):

- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 5000)
- `JWT_SECRET` - Secret for JWT tokens
- `S3_BUCKET` - S3 bucket name (optional)
- `AWS_ACCESS_KEY_ID` - AWS access key (optional)
- `AWS_SECRET_ACCESS_KEY` - AWS secret key (optional)
- `CORS_ORIGIN` - CORS allowed origins

## 📝 Database Schema

The platform uses a multi-tenant architecture with the following main entities:

- **users** - Admin user accounts with roles (owner, editor, reviewer)
- **clients** - Multi-tenant client management
- **campaigns** - Top-level folders for organizing assessments
- **projects** - Assessments grouped under campaigns
- **assessments** - Individual assessment instances with versioning
- **blocks** - Question/element blocks within assessments
- **assessment_submissions** - User submissions for assessments
- **block_responses** - Individual responses to blocks
- **api_keys** - API keys for external integrations
- **webhook_events** - Log of webhook triggers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### Database won't start
- Ensure Docker Desktop is running
- Check if port 5433 is already in use: `lsof -i :5433`
- View logs: `npm run db:logs`

### Connection errors
- Wait a few seconds after starting the database
- Verify the container is healthy: `docker ps`
- Check the `.env` file has the correct `DATABASE_URL`

### Port conflicts
- Use `npm run kill-port` to free up port 5000
- Or update `PORT` in your `.env` file

### Reset everything
```bash
npm run db:reset
npm run db:push
```

