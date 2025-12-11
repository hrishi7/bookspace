#!/bin/bash

# BookSpace - Quick Setup Script
# This script automates the containerized setup process

set -e  # Exit on error

echo "🚀 BookSpace Quick Setup Script"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo "ℹ $1"
}

# Check prerequisites
echo "Step 1: Checking prerequisites..."
echo "=================================="

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_success "Node.js installed: $NODE_VERSION"
else
    print_error "Node.js is not installed. Please install Node.js >= 20.0.0"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    print_success "npm installed: $NPM_VERSION"
else
    print_error "npm is not installed"
    exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    print_success "Docker installed: $DOCKER_VERSION"
else
    print_error "Docker is not installed. Please install Docker Desktop"
    exit 1
fi

# Check Docker Compose
if command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version)
    print_success "Docker Compose installed: $COMPOSE_VERSION"
else
    print_error "Docker Compose is not installed"
    exit 1
fi

echo ""

# Install dependencies
echo "Step 2: Installing dependencies..."
echo "===================================="
npm install
print_success "Dependencies installed"
echo ""

# Build shared packages
echo "Step 3: Building shared packages..."
echo "===================================="
npm run build -w @bookspace/logger
print_success "Logger package built"

npm run build -w @bookspace/common
print_success "Common package built"

npm run build -w @bookspace/types
print_success "Types package built"
echo ""

# Copy environment files
echo "Step 4: Setting up environment files..."
echo "========================================="

services=(gateway auth user document file upload search worker)

for service in "${services[@]}"; do
    if [ -f "services/$service/.env.example" ]; then
        if [ ! -f "services/$service/.env" ]; then
            cp "services/$service/.env.example" "services/$service/.env"
            print_success "Created .env for $service"
        else
            print_warning ".env already exists for $service (skipped)"
        fi
    fi
done
echo ""

# Start Docker services
echo "Step 5: Starting Docker containers..."
echo "======================================"
docker-compose up -d
print_success "Docker containers started"
echo ""

# Wait for services to be healthy
echo "Step 6: Waiting for services to be healthy..."
echo "==============================================="
sleep 5

# Check container status
if docker-compose ps | grep -q "Up"; then
    print_success "Containers are running"
else
    print_error "Some containers failed to start"
    docker-compose ps
    exit 1
fi
echo ""

# Display status
echo "Step 7: Verifying setup..."
echo "==========================="
echo ""
docker-compose ps
echo ""

# Print next steps
echo "========================================"
echo "🎉 Setup Complete!"
echo "========================================"
echo ""
echo "Infrastructure Services Running:"
echo "  • PostgreSQL:     localhost:5432"
echo "  • MongoDB:        localhost:27017"
echo "  • Redis:          localhost:6379"
echo "  • RabbitMQ:       localhost:5672"
echo "  • Elasticsearch:  localhost:9200"
echo "  • Prometheus:     http://localhost:9090"
echo "  • Grafana:        http://localhost:3001"
echo ""
echo "Management UIs:"
echo "  • RabbitMQ:       http://localhost:15672"
echo "    Username: bookspace"
echo "    Password: bookspace_dev_password"
echo ""
echo "  • Grafana:        http://localhost:3001"
echo "    Username: admin"
echo "    Password: admin"
echo ""
echo "Next Steps:"
echo "  1. Start all services:"
echo "     npm run dev"
echo ""
echo "  2. Or start services individually in separate terminals:"
echo "     cd services/gateway && npm run dev   # Port 3000"
echo "     cd services/auth && npm run dev      # Port 3001"
echo "     cd services/user && npm run dev      # Port 3002"
echo "     # ... and so on"
echo ""
echo "  3. Test the APIs:"
echo "     curl http://localhost:3000/health"
echo ""
echo "  4. View logs:"
echo "     docker-compose logs -f"
echo ""
echo "For detailed instructions, see:"
echo "  • CONTAINERIZED_SETUP_GUIDE.md (in artifacts)"
echo "  • QUICK_START.md"
echo "  • README.md"
echo ""
