# 1. Obtenir token
TOKEN=$(curl -sf -X POST http://10.20.0.147:8000/auth/login \
  -d "username=admin&password=admin" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Consultar l'ordre per ID
ORDER_ID="${1:-1}"
curl -s "http://10.20.0.147:8000/orders/${ORDER_ID}" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
