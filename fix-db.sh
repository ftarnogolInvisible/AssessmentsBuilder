#!/bin/bash

echo "🔧 Fixing database connection..."

# Stop and remove any existing containers
echo "Stopping containers..."
docker-compose down -v 2>/dev/null || true

# Remove the volume to start fresh
echo "Removing old database volume..."
docker volume rm assessment-builder_postgres_data 2>/dev/null || true

# Start fresh
echo "Starting database with correct credentials..."
docker-compose up -d

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 5

# Test connection
echo "Testing connection..."
until docker exec assessment-builder-db pg_isready -U assessment_user -d assessment_builder > /dev/null 2>&1; do
  echo "Waiting for database..."
  sleep 1
done

echo "✅ Database is ready!"
echo ""
echo "Now run: npm run db:push"

