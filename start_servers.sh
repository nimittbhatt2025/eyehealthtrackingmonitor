#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Eyevio Servers...${NC}\n"

# Kill any existing processes on the ports
echo -e "${BLUE}📌 Cleaning up existing processes...${NC}"
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5002 | xargs kill -9 2>/dev/null
sleep 1

# Start Backend
echo -e "${BLUE}🔧 Starting Backend on port 5002...${NC}"
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
PORT=5002 FLASK_ENV=development /Users/vivaanbhatt/Desktop/research-project/eyevio/venv/bin/python3.12 run.py > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"

# Wait for backend to start
sleep 3

# Test backend
if curl -s http://localhost:5002/api/health > /dev/null 2>&1 || lsof -i:5002 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is responding on http://localhost:5002${NC}"
else
    echo -e "${RED}❌ Backend failed to start. Check /tmp/backend.log${NC}"
fi

# Start Frontend
echo -e "\n${BLUE}🎨 Starting Frontend on port 3000...${NC}"
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"

sleep 3

echo -e "\n${GREEN}✨ Both servers are running!${NC}"
echo -e "${BLUE}Frontend:${NC} http://localhost:3000"
echo -e "${BLUE}Backend:${NC}  http://localhost:5002"
echo -e "\n${BLUE}📝 Logs:${NC}"
echo -e "  Backend:  tail -f /tmp/backend.log"
echo -e "  Frontend: tail -f /tmp/frontend.log"
echo -e "\n${BLUE}🛑 To stop servers:${NC}"
echo -e "  kill $BACKEND_PID $FRONTEND_PID"
echo -e "  or: lsof -ti:3000,5002 | xargs kill -9"
