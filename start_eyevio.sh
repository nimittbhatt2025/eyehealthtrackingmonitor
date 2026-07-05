#!/bin/bash

# EyeVio - Complete Startup Script
# This script starts both backend and frontend automatically

echo "🚀 Starting EyeVio..."
echo ""

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Kill any existing processes
echo "🧹 Cleaning up old processes..."
if check_port 5000; then
    echo "   Stopping old backend (port 5000)..."
    lsof -ti:5000 | xargs kill -9 2>/dev/null
fi

if check_port 5173; then
    echo "   Stopping old frontend (port 5173)..."
    lsof -ti:5173 | xargs kill -9 2>/dev/null
fi
echo ""

# Start backend
echo "🧠 Starting Backend (Python/Flask)..."
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
source venv/bin/activate
python run.py &
BACKEND_PID=$!
echo "   Backend started (PID: $BACKEND_PID)"
echo ""

# Wait for backend to start
sleep 3

# Start frontend
echo "🎨 Starting Frontend (React)..."
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend
npm run dev &
FRONTEND_PID=$!
echo "   Frontend started (PID: $FRONTEND_PID)"
echo ""

# Wait for frontend to start
sleep 5

echo "✅ EyeVio is running!"
echo ""
echo "📍 Open in your browser:"
echo "   👉 http://localhost:5173"
echo ""
echo "📊 Backend API:"
echo "   👉 http://localhost:5000"
echo ""
echo "🛑 To stop:"
echo "   Press Ctrl+C in this terminal"
echo ""
echo "💡 Tip: Keep this terminal window open while using the app!"
echo ""

# Wait for user to stop
wait
