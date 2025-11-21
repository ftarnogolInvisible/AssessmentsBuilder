#!/bin/bash

# Quick test script to verify setup

echo "🧪 Testing Assessment Builder Setup..."
echo ""

# Check if Docker is running
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "✅ Docker is running"

# Check if database container is running
if docker ps | grep -q assessment-builder-db; then
    echo "✅ Database container is running"
else
    echo "⚠️  Database container not running. Starting it..."
    npm run db:up
    echo "⏳ Waiting for database to be ready..."
    sleep 5
fi

# Check if .env exists
if [ -f .env ]; then
    echo "✅ .env file exists"
else
    echo "⚠️  .env file not found. Creating from env.example..."
    cp env.example .env
    echo "✅ .env file created"
fi

# Test database connection
echo ""
echo "🔍 Testing database connection..."
if npm run db:push > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed. Check your DATABASE_URL in .env"
    exit 1
fi

echo ""
echo "✅ Setup verification complete!"
echo ""
echo "Next steps:"
echo "1. Start the dev server: npm run dev"
echo "2. Open http://localhost:5000/api/health in your browser"
echo "3. Check TESTING.md for more test endpoints"

