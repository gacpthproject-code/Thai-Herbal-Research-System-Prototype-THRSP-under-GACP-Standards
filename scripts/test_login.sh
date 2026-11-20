#!/bin/bash
echo "=== TEST 1: Backend login API ==="
docker exec gacp-nginx curl -s -w "\nHTTP:%{http_code}" -X POST http://backend:8000/api/auth/health/login -H "Content-Type: application/json" -d '{"identifier":"1709901457027","password":"test123"}'
echo ""
echo "=== TEST 2: Frontend proxy ==="
docker exec gacp-nginx curl -s -w "\nHTTP:%{http_code}" -X POST http://frontend:3000/api/auth/health/login -H "Content-Type: application/json" -d '{"identifier":"1709901457027","password":"test123"}'
echo ""
echo "=== TEST 3: Login error logs ==="
docker logs gacp-backend --since 2m 2>&1 | grep -iE "login|auth.*fail|401|error.*auth" | tail -10
