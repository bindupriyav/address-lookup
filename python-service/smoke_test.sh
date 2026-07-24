#!/bin/bash
set -e

SERVICE_URL="${1:?Usage: ./smoke_test.sh <service-url>}"

echo "=== Smoke Test: USPS Address Validation Service ==="
echo "Target: ${SERVICE_URL}"
echo ""

PASS=0
FAIL=0

# Test 1: Health check
echo -n "Test 1: GET /health ... "
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/health")
if [ "$RESPONSE" = "200" ]; then
  BODY=$(curl -s "${SERVICE_URL}/health")
  if echo "$BODY" | grep -q '"status"'; then
    echo "PASS (HTTP 200, JSON body contains status)"
    PASS=$((PASS + 1))
  else
    echo "FAIL (HTTP 200 but response missing 'status' field)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "FAIL (HTTP $RESPONSE)"
  FAIL=$((FAIL + 1))
fi

# Test 2: Address validation
echo -n "Test 2: POST /api/v1/validate/address ... "
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SERVICE_URL}/api/v1/validate/address" \
  -H "Content-Type: application/json" \
  -d '{"street_line_1":"1600 Pennsylvania Ave NW","city":"Washington","state":"DC","zipcode":"20500"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q '"status"'; then
  echo "PASS (HTTP 200, valid response)"
  PASS=$((PASS + 1))
else
  echo "FAIL (HTTP $HTTP_CODE)"
  FAIL=$((FAIL + 1))
fi

# Test 3: Unauthenticated access (no auth headers)
echo -n "Test 3: Unauthenticated access ... "
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --no-negotiate --no-sessionid \
  -H "Authorization:" "${SERVICE_URL}/health")
if [ "$RESPONSE" = "200" ]; then
  echo "PASS (accessible without auth)"
  PASS=$((PASS + 1))
else
  echo "FAIL (HTTP $RESPONSE - may require authentication)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
