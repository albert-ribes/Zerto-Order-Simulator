#!/bin/bash
# 1. Get token
TOKEN=$(curl -sf -X POST http://backend.tec.bcn:8000/auth/login \
  -d "username=admin&password=admin" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Create ordrer (client_id, product_id, quantity)
curl -s -X POST http://backend.tec.bcn:8000/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"client_id": 16, "product_id": 39, "quantity": 30}' | python3 -m json.tool

