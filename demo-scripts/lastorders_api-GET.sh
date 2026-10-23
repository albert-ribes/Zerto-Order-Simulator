# 1. Get token
TOKEN=$(curl -sf -X POST http://backend.tec.bcn:8000/auth/login \
  -d "username=admin&password=admin" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Obtain last orders
curl -s "http://backend.tec.bcn:8000/orders?limit=5&offset=0" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

