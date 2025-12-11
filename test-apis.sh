#!/bin/bash

# BookSpace - API Testing Script
# Quick script to test all API endpoints

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Base URL
GATEWAY_URL="http://localhost:3000"

echo ""
print_header "BookSpace API Testing Script"
echo ""

# Test 1: Health checks
print_header "1. Testing Health Endpoints"
echo ""

services=(
    "3000:Gateway"
    "3001:Auth"
    "3002:User"
    "3003:Document"
    "3004:Upload"
    "3005:Search"
    "3006:Worker"
)

for service in "${services[@]}"; do
    IFS=':' read -r port name <<< "$service"
    if curl -s -f -o /dev/null "http://localhost:$port/health" 2>/dev/null; then
        print_success "$name service (port $port) is healthy"
    else
        print_error "$name service (port $port) is not responding"
    fi
done

echo ""
print_header "2. Testing Authentication Flow"
echo ""

# Generate random email to avoid conflicts
RANDOM_EMAIL="test_$(date +%s)@example.com"

# Register
print_info "Registering user: $RANDOM_EMAIL"
REGISTER_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$RANDOM_EMAIL\",
    \"password\": \"SecurePass123!\",
    \"name\": \"Test User\"
  }" 2>/dev/null || echo '{"error": true}')

if echo "$REGISTER_RESPONSE" | grep -q "error"; then
    print_error "Registration failed"
    echo "Response: $REGISTER_RESPONSE"
else
    print_success "User registered successfully"
fi

echo ""

# Login
print_info "Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$RANDOM_EMAIL\",
    \"password\": \"SecurePass123!\"
  }" 2>/dev/null || echo '{"error": true}')

if echo "$LOGIN_RESPONSE" | grep -q "accessToken"; then
    print_success "Login successful"
    ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    print_info "Access token obtained"
else
    print_error "Login failed"
    echo "Response: $LOGIN_RESPONSE"
    ACCESS_TOKEN=""
fi

echo ""

# Test protected endpoint
if [ -n "$ACCESS_TOKEN" ]; then
    print_header "3. Testing Protected Endpoints"
    echo ""
    
    print_info "Fetching user profile..."
    PROFILE_RESPONSE=$(curl -s "$GATEWAY_URL/api/users/me" \
      -H "Authorization: Bearer $ACCESS_TOKEN" 2>/dev/null || echo '{"error": true}')
    
    if echo "$PROFILE_RESPONSE" | grep -q "$RANDOM_EMAIL"; then
        print_success "Profile fetched successfully"
    else
        print_error "Failed to fetch profile"
    fi
    
    echo ""
    print_info "Creating a document..."
    DOC_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/documents" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "title": "Test Document",
        "content": "This is a test document created by the API test script",
        "tags": ["test", "automated"]
      }' 2>/dev/null || echo '{"error": true}')
    
    if echo "$DOC_RESPONSE" | grep -q "Test Document"; then
        print_success "Document created successfully"
    else
        print_error "Failed to create document"
    fi
    
    echo ""
    print_info "Searching documents..."
    SEARCH_RESPONSE=$(curl -s "$GATEWAY_URL/api/search?q=test" \
      -H "Authorization: Bearer $ACCESS_TOKEN" 2>/dev/null || echo '{"error": true}')
    
    if echo "$SEARCH_RESPONSE" | grep -q "results"; then
        print_success "Search completed successfully"
    else
        print_error "Search failed"
    fi
fi

echo ""
print_header "4. Testing Infrastructure Services"
echo ""

# Test Redis
if redis-cli ping 2>/dev/null | grep -q "PONG"; then
    print_success "Redis is responding"
else
    print_error "Redis is not responding"
fi

# Test Elasticsearch
if curl -s -f -o /dev/null "http://localhost:9200/_cluster/health" 2>/dev/null; then
    print_success "Elasticsearch is responding"
else
    print_error "Elasticsearch is not responding"
fi

# Test RabbitMQ
if curl -s -f -o /dev/null -u "bookspace:bookspace_dev_password" "http://localhost:15672/api/overview" 2>/dev/null; then
    print_success "RabbitMQ is responding"
else
    print_error "RabbitMQ is not responding"
fi

echo ""
print_header "Testing Complete!"
echo ""
print_info "Management UIs:"
echo "  • RabbitMQ: http://localhost:15672"
echo "  • Grafana:  http://localhost:3001"
echo "  • Prometheus: http://localhost:9090"
echo ""
