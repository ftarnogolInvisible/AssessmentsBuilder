#!/bin/bash

echo "🔍 Checking database setup..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ .env file not found"
  echo "📝 Creating .env from env.example..."
  cp env.example .env
  echo "✅ .env file created"
else
  echo "✅ .env file exists"
fi

# Check DATABASE_URL
if grep -q "^DATABASE_URL=" .env; then
  echo "✅ DATABASE_URL found in .env"
  grep "^DATABASE_URL=" .env
else
  echo "❌ DATABASE_URL not found in .env"
  echo "📝 Adding DATABASE_URL to .env..."
  echo "DATABASE_URL=postgresql://assessment_user:assessment_password@localhost:5432/assessment_builder" >> .env
  echo "✅ DATABASE_URL added"
fi

# Check if Docker is running
if docker ps > /dev/null 2>&1; then
  echo "✅ Docker is running"
  
  # Check if postgres container is running
  if docker ps | grep -q assessment-builder-db; then
    echo "✅ PostgreSQL container is running"
  else
    echo "❌ PostgreSQL container is not running"
    echo "💡 Run: npm run db:up"
  fi
else
  echo "❌ Docker is not running"
  echo "💡 Please start Docker Desktop"
fi

echo ""
echo "📋 Current DATABASE_URL:"
grep "^DATABASE_URL=" .env || echo "Not found"

