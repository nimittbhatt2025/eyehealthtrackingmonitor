#!/bin/bash

# Kill existing servers
echo "🛑 Stopping existing servers..."
pkill -f "python.*run.py" 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5002 | xargs kill -9 2>/dev/null
sleep 2

# Start backend
echo "🔧 Starting backend on port 5002..."
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
nohup /Users/vivaanbhatt/Desktop/research-project/eyevio/venv/bin/python3.12 run.py > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend
sleep 3

# Check backend
if lsof -i:5002 > /dev/null 2>&1; then
    echo "   ✅ Backend running on http://localhost:5002"
else
    echo "   ❌ Backend failed! Check /tmp/backend.log"
    exit 1
fi

# Start frontend  
echo "🎨 Starting frontend on port 3000..."
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend
nohup npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

# Wait for frontend
sleep 4

# Check frontend
if lsof -i:3000 > /dev/null 2>&1; then
    echo "   ✅ Frontend running on http://localhost:3000"
else
    echo "   ❌ Frontend failed! Check /tmp/frontend.log"
    exit 1
fi

echo ""
echo "✨ SERVERS RUNNING!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:5002"
echo ""
echo "To view logs:"
echo "  tail -f /tmp/backend.log"
echo "  tail -f /tmp/frontend.log"
echo ""
echo "To stop:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
