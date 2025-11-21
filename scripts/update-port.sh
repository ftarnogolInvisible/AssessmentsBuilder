#!/bin/bash

# Update PORT in .env file
ENV_FILE=".env"
NEW_PORT=${1:-3000}

if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file from env.example..."
    cp env.example .env
fi

# Update PORT in .env file
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/^PORT=.*/PORT=$NEW_PORT/" "$ENV_FILE"
else
    # Linux
    sed -i "s/^PORT=.*/PORT=$NEW_PORT/" "$ENV_FILE"
fi

echo "✅ Updated PORT to $NEW_PORT in .env file"
echo "📝 Current PORT setting:"
grep "^PORT=" "$ENV_FILE"

