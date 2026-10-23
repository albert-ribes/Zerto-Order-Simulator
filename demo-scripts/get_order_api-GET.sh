# 1. Get token
TOKEN=$(curl -sf -X POST http://backend.tec.bcn:8000/auth/login \
  -d "username=admin&password=admin" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Check Ordre by ID
ORDER_ID="${1:-1}"
curl -s "http://backend.tec.bcn:8000/orders/${ORDER_ID}" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
