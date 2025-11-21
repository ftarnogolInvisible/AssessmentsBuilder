# Quick Setup Guide

## Using Docker Desktop (Recommended)

### Step 1: Start Docker Desktop
Make sure Docker Desktop is running on your machine.

### Step 2: Install Dependencies
```bash
cd /Users/ftarnogol/AssessmentsBuilder/AssessmentBuilder
npm install
```

### Step 3: Start Database
```bash
npm run db:up
```
This starts a PostgreSQL container. Wait a few seconds for it to be ready.

### Step 4: Create Environment File
```bash
cp env.example .env
```
The default `.env` file is already configured for Docker - no changes needed!

### Step 5: Create Database Tables
```bash
npm run db:push
```
This creates all the required tables in your database.

### Step 6: Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## Verify Database is Running

Check if the database container is running:
```bash
docker ps
```

You should see a container named `assessment-builder-db` running.

## Troubleshooting

### Database won't start
- Make sure Docker Desktop is running
- Check if port 5432 is already in use: `lsof -i :5432`
- View logs: `npm run db:logs`

### Connection errors
- Wait a few seconds after starting the database
- Verify the container is healthy: `docker ps`
- Check the `.env` file has the correct DATABASE_URL

### Reset everything
```bash
npm run db:reset
npm run db:push
```

## Next Steps

Once the database is running and migrations are complete, you can:
- Access Drizzle Studio: `npm run db:studio`
- Start building the UI components
- Test API endpoints

