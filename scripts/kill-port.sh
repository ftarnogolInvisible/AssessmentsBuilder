#!/bin/bash

# Kill process on port 5000
PORT=5000

echo "Looking for process on port $PORT..."

# Find PID using port
PID=$(lsof -ti:$PORT)

if [ -z "$PID" ]; then
    echo "No process found on port $PORT"
else
    echo "Found process $PID on port $PORT"
    echo "Killing process..."
    kill -9 $PID
    echo "Process killed"
fi

