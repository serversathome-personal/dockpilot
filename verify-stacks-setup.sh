#!/bin/bash

echo "==================================="
echo "Docker Stacks Implementation Verification"
echo "==================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check backend files
echo "Checking Backend Files..."
if [ -f "/project/backend/src/api/routes/stacks.js" ]; then
    check_pass "Stack routes file exists"
else
    check_fail "Stack routes file missing"
fi

if [ -f "/project/backend/src/services/stack.service.js" ]; then
    check_pass "Stack service file exists"
else
    check_fail "Stack service file missing"
fi

if [ -f "/project/backend/.env" ]; then
    check_pass "Backend .env file exists"
else
    check_fail "Backend .env file missing"
fi

# Check frontend files
echo ""
echo "Checking Frontend Files..."
if [ -f "/project/frontend/src/components/stacks/StacksView.jsx" ]; then
    check_pass "StacksView component exists"
else
    check_fail "StacksView component missing"
fi

if [ -f "/project/frontend/src/api/stacks.api.js" ]; then
    check_pass "Stacks API client exists"
else
    check_fail "Stacks API client missing"
fi

if [ -f "/project/frontend/.env" ]; then
    check_pass "Frontend .env file exists"
else
    check_fail "Frontend .env file missing"
fi

# Check dependencies
echo ""
echo "Checking Dependencies..."
if grep -q '"js-yaml"' /project/frontend/package.json; then
    check_pass "js-yaml in frontend package.json"
else
    check_fail "js-yaml missing from frontend package.json"
fi

if grep -q '"js-yaml"' /project/backend/package.json; then
    check_pass "js-yaml in backend package.json"
else
    check_fail "js-yaml missing from backend package.json"
fi

# Check stacks directory
echo ""
echo "Checking Stacks Directory..."
if [ -d "/stacks" ]; then
    check_pass "Stacks directory exists"

    # Check permissions
    if [ -w "/stacks" ]; then
        check_pass "Stacks directory is writable"
    else
        check_fail "Stacks directory is not writable"
    fi
else
    check_fail "Stacks directory does not exist"
fi

# Check test stack
if [ -d "/stacks/test-stack" ]; then
    check_pass "Test stack directory exists"

    if [ -f "/stacks/test-stack/docker-compose.yml" ]; then
        check_pass "Test stack compose file exists"
    else
        check_warn "Test stack compose file missing"
    fi

    if [ -f "/stacks/test-stack/.env" ]; then
        check_pass "Test stack env file exists"
    else
        check_warn "Test stack env file missing"
    fi
else
    check_warn "Test stack not found (optional)"
fi

# Check configuration
echo ""
echo "Checking Configuration..."

# Backend port
BACKEND_PORT=$(grep "^PORT=" /project/backend/.env | cut -d'=' -f2)
if [ "$BACKEND_PORT" = "5000" ]; then
    check_pass "Backend port is 5000"
else
    check_warn "Backend port is $BACKEND_PORT (expected 5000)"
fi

# Stacks directory config
STACKS_DIR=$(grep "^STACKS_DIR=" /project/backend/.env | cut -d'=' -f2)
if [ "$STACKS_DIR" = "/stacks" ]; then
    check_pass "Stacks directory configured correctly"
else
    check_warn "Stacks directory is $STACKS_DIR (expected /stacks)"
fi

# Frontend API URL
if [ -f "/project/frontend/.env" ]; then
    FRONTEND_API=$(grep "^VITE_API_BASE_URL=" /project/frontend/.env | cut -d'=' -f2)
    if [ "$FRONTEND_API" = "http://localhost:5000" ]; then
        check_pass "Frontend API URL configured correctly"
    else
        check_warn "Frontend API URL is $FRONTEND_API (expected http://localhost:5000)"
    fi
fi

# Check if routes are registered
echo ""
echo "Checking Route Registration..."
if grep -q "stacksRoutes" /project/backend/src/api/index.js; then
    check_pass "Stack routes registered in API index"
else
    check_fail "Stack routes not registered"
fi

# Summary
echo ""
echo "==================================="
echo "Verification Complete"
echo "==================================="
echo ""
echo "To start the application:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd /project/backend"
echo "    npm run dev"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    cd /project/frontend"
echo "    npm run dev"
echo ""
echo "Then navigate to: http://localhost:5173/stacks"
echo ""
