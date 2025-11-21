#!/bin/bash

echo "Checking what's using port 5000..."
lsof -i :5000

echo ""
echo "To kill it, run:"
echo "lsof -ti:5000 | xargs kill -9"

