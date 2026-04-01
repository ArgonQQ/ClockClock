#!/bin/sh
# ClockClock — Test & Seed Script
# Usage:
#   ./test.sh              Run permission tests
#   ./test.sh seed         Seed realistic demo data
#   ./test.sh [base_url]   Run tests against custom URL

BASE="${1:-http://localhost:3000}"
ADMIN_PASS="${ADMIN_PASSWORD:-admin}"

# ── Seed mode ──────────────────────────────────────
if [ "$1" = "seed" ]; then
  BASE="${2:-http://localhost:3000}"
  echo "Seeding ClockClock at $BASE ..."

  http() { curl -s "$@"; }
  post() { http -b "$1" -X POST "$BASE$2" -H 'Content-Type: application/json' -d "$3" > /dev/null; }
  post_get_id() { http -b "$1" -X POST "$BASE$2" -H 'Content-Type: application/json' -d "$3" | sed -n 's/.*"id":\([0-9]*\).*/\1/p'; }
  entry() { post "$1" "/api/entries" "{\"customer_id\":$2,\"date\":\"$3\",\"time_from\":\"$4\",\"time_to\":\"$5\",\"minutes\":$6,\"description\":\"$7\"}"; }

  # Login admin
  http -c /tmp/cc-admin -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}" > /dev/null

  # Create users
  post /tmp/cc-admin "/api/users" '{"username":"sarah.mueller","password":"sarah2026","role":"user"}'
  post /tmp/cc-admin "/api/users" '{"username":"tom.brenner","password":"tom2026","role":"user"}'
  http -c /tmp/cc-sarah -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"sarah.mueller","password":"sarah2026"}' > /dev/null
  http -c /tmp/cc-tom -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"tom.brenner","password":"tom2026"}' > /dev/null

  # Admin customers
  C1=$(post_get_id /tmp/cc-admin "/api/customers" '{"name":"Hofmann Metallbau GmbH","contact_person":"Klaus Hofmann","email":"k.hofmann@hofmann-metall.de","phone":"+49 711 4829301","address":"Industriestr. 42","city":"Stuttgart","zip":"70173","country":"Germany","notes":"Monthly retainer, invoiced end of month"}')
  C2=$(post_get_id /tmp/cc-admin "/api/customers" '{"name":"Lindgren & Partners","contact_person":"Anna Lindgren","email":"anna@lindgren-partners.se","phone":"+46 8 5551234","address":"Sveavägen 28","city":"Stockholm","zip":"111 34","country":"Sweden","notes":"Legal consultancy, EN invoices only"}')

  # Sarah customers
  C3=$(post_get_id /tmp/cc-sarah "/api/customers" '{"name":"Café Morgenrot","contact_person":"Lena Wirth","email":"lena@cafe-morgenrot.de","phone":"+49 30 9928374","address":"Kastanienallee 8","city":"Berlin","zip":"10435","country":"Germany","notes":"Website relaunch + ongoing content updates"}')
  C4=$(post_get_id /tmp/cc-sarah "/api/customers" '{"name":"Dr. Petersen Zahnarztpraxis","contact_person":"Dr. Martin Petersen","email":"praxis@petersen-dental.de","phone":"+49 40 3317890","address":"Eppendorfer Weg 112","city":"Hamburg","zip":"20259","country":"Germany"}')

  # Tom customers
  C5=$(post_get_id /tmp/cc-tom "/api/customers" '{"name":"Vinotek GmbH","contact_person":"Marco Bellini","email":"marco@vinotek.de","phone":"+49 89 2244110","address":"Maximilianstr. 15","city":"Munich","zip":"80539","country":"Germany","notes":"E-commerce platform, quarterly sprints"}')
  C6=$(post_get_id /tmp/cc-tom "/api/customers" '{"name":"Nowak Transport Sp. z o.o.","contact_person":"Paweł Nowak","email":"pawel@nowak-transport.pl","phone":"+48 22 6781234","address":"ul. Marszałkowska 84","city":"Warsaw","zip":"00-514","country":"Poland","notes":"Fleet tracking dashboard"}')

  echo "  Customers: admin=$C1,$C2  sarah=$C3,$C4  tom=$C5,$C6"

  # Admin entries — Hofmann Metallbau
  entry /tmp/cc-admin $C1 "2026-03-16" "09:00" "10:30" 90 "Server migration planning, reviewed current infrastructure"
  entry /tmp/cc-admin $C1 "2026-03-17" "08:30" "11:00" 150 "Migrated mail server to new host, DNS cutover"
  entry /tmp/cc-admin $C1 "2026-03-18" "14:00" "15:30" 90 "Firewall rules audit and cleanup"
  entry /tmp/cc-admin $C1 "2026-03-23" "09:00" "12:00" 180 "Set up monitoring with Uptime Kuma, configured alerts"
  entry /tmp/cc-admin $C1 "2026-03-24" "13:00" "14:45" 105 "VPN tunnel configuration for remote office"
  entry /tmp/cc-admin $C1 "2026-03-27" "10:00" "11:30" 90 "Backup verification and disaster recovery test"

  # Admin entries — Lindgren & Partners
  entry /tmp/cc-admin $C2 "2026-03-17" "13:00" "14:30" 90 "Initial call, gathered requirements for document portal"
  entry /tmp/cc-admin $C2 "2026-03-19" "09:30" "12:00" 150 "Prototype document upload and tagging system"
  entry /tmp/cc-admin $C2 "2026-03-24" "09:00" "11:00" 120 "Integrated SSO with their Azure AD"
  entry /tmp/cc-admin $C2 "2026-03-26" "14:00" "16:00" 120 "User acceptance testing, fixed permission edge cases"
  entry /tmp/cc-admin $C2 "2026-03-28" "10:00" "11:00" 60 "Deployed to production, handed over admin docs"

  # Sarah entries — Café Morgenrot
  entry /tmp/cc-sarah $C3 "2026-03-16" "10:00" "12:30" 150 "Wireframes for new homepage and menu page"
  entry /tmp/cc-sarah $C3 "2026-03-18" "09:00" "11:00" 120 "Designed hero section, selected photography"
  entry /tmp/cc-sarah $C3 "2026-03-19" "13:00" "15:30" 150 "Built responsive layout, mobile navigation"
  entry /tmp/cc-sarah $C3 "2026-03-23" "09:00" "10:30" 90 "Contact form with booking integration"
  entry /tmp/cc-sarah $C3 "2026-03-25" "10:00" "12:00" 120 "SEO optimization, Open Graph tags, sitemap"
  entry /tmp/cc-sarah $C3 "2026-03-27" "14:00" "15:00" 60 "Final review with client, deployed to live"

  # Sarah entries — Dr. Petersen
  entry /tmp/cc-sarah $C4 "2026-03-17" "09:00" "10:00" 60 "Kick-off call, reviewed existing website issues"
  entry /tmp/cc-sarah $C4 "2026-03-20" "10:00" "12:30" 150 "Redesigned appointment booking flow"
  entry /tmp/cc-sarah $C4 "2026-03-24" "13:00" "15:00" 120 "Implemented Doctolib calendar widget integration"
  entry /tmp/cc-sarah $C4 "2026-03-26" "09:00" "10:30" 90 "GDPR cookie banner and privacy policy page"
  entry /tmp/cc-sarah $C4 "2026-03-28" "11:00" "12:00" 60 "Cross-browser testing, fixed Safari layout bug"

  # Tom entries — Vinotek
  entry /tmp/cc-tom $C5 "2026-03-16" "08:00" "10:30" 150 "Sprint planning, broke down product filter stories"
  entry /tmp/cc-tom $C5 "2026-03-17" "09:00" "12:00" 180 "Built faceted search for wine catalog"
  entry /tmp/cc-tom $C5 "2026-03-18" "13:00" "15:00" 120 "Shopping cart persistence with localStorage fallback"
  entry /tmp/cc-tom $C5 "2026-03-20" "09:00" "11:30" 150 "Stripe checkout integration, test transactions"
  entry /tmp/cc-tom $C5 "2026-03-23" "08:30" "10:00" 90 "Age verification gate for alcohol sales"
  entry /tmp/cc-tom $C5 "2026-03-25" "13:00" "16:00" 180 "Performance audit, lazy-loaded product images"
  entry /tmp/cc-tom $C5 "2026-03-27" "09:00" "10:30" 90 "Sprint review demo with stakeholders"

  # Tom entries — Nowak Transport
  entry /tmp/cc-tom $C6 "2026-03-18" "09:00" "11:00" 120 "Requirements workshop for fleet tracking dashboard"
  entry /tmp/cc-tom $C6 "2026-03-19" "13:00" "16:00" 180 "Set up map view with Leaflet, real-time GPS markers"
  entry /tmp/cc-tom $C6 "2026-03-24" "09:00" "12:00" 180 "Driver assignment panel, drag-and-drop routes"
  entry /tmp/cc-tom $C6 "2026-03-26" "08:00" "10:30" 150 "WebSocket integration for live position updates"
  entry /tmp/cc-tom $C6 "2026-03-28" "13:00" "15:00" 120 "Fuel consumption reports, CSV export"

  rm -f /tmp/cc-admin /tmp/cc-sarah /tmp/cc-tom
  echo "  Done: 3 users, 6 customers, 28 entries."
  echo ""
  echo "  Logins:"
  echo "    admin / $ADMIN_PASS"
  echo "    sarah.mueller / sarah2026"
  echo "    tom.brenner / tom2026"
  exit 0
fi

# ── Test mode ──────────────────────────────────────
PASS=0
FAIL=0
TOTAL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[0;90m'
NC='\033[0m'

assert() {
  TOTAL=$((TOTAL + 1))
  desc="$1"; expected="$2"; actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}✓${NC} %s\n" "$desc"
  else
    FAIL=$((FAIL + 1))
    printf "  ${RED}✗${NC} %s ${DIM}(expected: %s, got: %s)${NC}\n" "$desc" "$expected" "$actual"
  fi
}

assert_contains() {
  TOTAL=$((TOTAL + 1))
  desc="$1"; needle="$2"; haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}✓${NC} %s\n" "$desc"
  else
    FAIL=$((FAIL + 1))
    printf "  ${RED}✗${NC} %s ${DIM}(expected to contain: %s)${NC}\n" "$desc" "$needle"
  fi
}

assert_not_contains() {
  TOTAL=$((TOTAL + 1))
  desc="$1"; needle="$2"; haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    FAIL=$((FAIL + 1))
    printf "  ${RED}✗${NC} %s ${DIM}(should not contain: %s)${NC}\n" "$desc" "$needle"
  else
    PASS=$((PASS + 1))
    printf "  ${GREEN}✓${NC} %s\n" "$desc"
  fi
}

http_status() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
http_body() { curl -s "$@"; }

echo ""
echo "ClockClock Test Suite"
echo "Base: $BASE"
echo ""

# ── Auth ───────────────────────────────────────────
echo "Auth"
STATUS=$(http_status -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"wrong"}')
assert "reject bad password" "401" "$STATUS"

STATUS=$(http_status -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}")
assert "admin login succeeds" "200" "$STATUS"

http_body -c /tmp/cc-admin -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}" > /dev/null

assert "admin session valid" "200" "$(http_status -b /tmp/cc-admin "$BASE/auth/me")"
assert "unauthenticated rejected" "401" "$(http_status "$BASE/auth/me")"

# ── Admin creates test users ──────────────────────
echo ""
echo "User Management"
http_body -b /tmp/cc-admin -X POST "$BASE/api/users" -H 'Content-Type: application/json' -d '{"username":"testuser1","password":"tp1","role":"user"}' > /dev/null
http_body -b /tmp/cc-admin -X POST "$BASE/api/users" -H 'Content-Type: application/json' -d '{"username":"testuser2","password":"tp2","role":"user"}' > /dev/null

http_body -c /tmp/cc-tu1 -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"testuser1","password":"tp1"}' > /dev/null
http_body -c /tmp/cc-tu2 -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"testuser2","password":"tp2"}' > /dev/null

assert "testuser1 login" "200" "$(http_status -b /tmp/cc-tu1 "$BASE/auth/me")"
assert "testuser2 login" "200" "$(http_status -b /tmp/cc-tu2 "$BASE/auth/me")"
assert "user cannot list users" "403" "$(http_status -b /tmp/cc-tu1 "$BASE/api/users")"

# ── Customer Isolation ─────────────────────────────
echo ""
echo "Customer Isolation"

AC=$(http_body -b /tmp/cc-admin -X POST "$BASE/api/customers" -H 'Content-Type: application/json' -d '{"name":"TestAdminCorp"}')
AC_ID=$(echo "$AC" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')

U1C=$(http_body -b /tmp/cc-tu1 -X POST "$BASE/api/customers" -H 'Content-Type: application/json' -d '{"name":"TestUser1Client"}')
U1C_ID=$(echo "$U1C" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')

U2C=$(http_body -b /tmp/cc-tu2 -X POST "$BASE/api/customers" -H 'Content-Type: application/json' -d '{"name":"TestUser2Partner"}')
U2C_ID=$(echo "$U2C" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')

U1_CUSTS=$(http_body -b /tmp/cc-tu1 "$BASE/api/customers")
assert_contains "user1 sees own customer" "TestUser1Client" "$U1_CUSTS"
assert_not_contains "user1 cannot see admin customer" "TestAdminCorp" "$U1_CUSTS"
assert_not_contains "user1 cannot see user2 customer" "TestUser2Partner" "$U1_CUSTS"

U2_CUSTS=$(http_body -b /tmp/cc-tu2 "$BASE/api/customers")
assert_contains "user2 sees own customer" "TestUser2Partner" "$U2_CUSTS"
assert_not_contains "user2 cannot see user1 customer" "TestUser1Client" "$U2_CUSTS"

ADMIN_CUSTS=$(http_body -b /tmp/cc-admin "$BASE/api/customers")
assert_contains "admin sees all — admin" "TestAdminCorp" "$ADMIN_CUSTS"
assert_contains "admin sees all — user1" "TestUser1Client" "$ADMIN_CUSTS"
assert_contains "admin sees all — user2" "TestUser2Partner" "$ADMIN_CUSTS"

assert "user1 cannot edit user2 customer" "403" "$(http_status -b /tmp/cc-tu1 -X PUT "$BASE/api/customers/$U2C_ID" -H 'Content-Type: application/json' -d '{"name":"Hacked"}')"
assert "user1 cannot delete user2 customer" "403" "$(http_status -b /tmp/cc-tu1 -X DELETE "$BASE/api/customers/$U2C_ID")"
assert "admin can edit any customer" "200" "$(http_status -b /tmp/cc-admin -X PUT "$BASE/api/customers/$U1C_ID" -H 'Content-Type: application/json' -d '{"city":"TestCity"}')"

# ── Entry Isolation ────────────────────────────────
echo ""
echo "Entry Isolation"

http_body -b /tmp/cc-tu1 -X POST "$BASE/api/entries" -H 'Content-Type: application/json' -d "{\"customer_id\":$U1C_ID,\"date\":\"2026-03-30\",\"time_from\":\"09:00\",\"time_to\":\"10:00\",\"minutes\":60,\"description\":\"tu1 work\"}" > /dev/null
http_body -b /tmp/cc-tu2 -X POST "$BASE/api/entries" -H 'Content-Type: application/json' -d "{\"customer_id\":$U2C_ID,\"date\":\"2026-03-30\",\"time_from\":\"11:00\",\"time_to\":\"12:00\",\"minutes\":60,\"description\":\"tu2 work\"}" > /dev/null
http_body -b /tmp/cc-admin -X POST "$BASE/api/entries" -H 'Content-Type: application/json' -d "{\"customer_id\":$AC_ID,\"date\":\"2026-03-30\",\"time_from\":\"14:00\",\"time_to\":\"15:00\",\"minutes\":60,\"description\":\"admin work\"}" > /dev/null

U1E=$(http_body -b /tmp/cc-tu1 "$BASE/api/entries")
assert_contains "user1 sees own entry" "tu1 work" "$U1E"
assert_not_contains "user1 cannot see user2 entry" "tu2 work" "$U1E"
assert_not_contains "user1 cannot see admin entry" "admin work" "$U1E"

U2E=$(http_body -b /tmp/cc-tu2 "$BASE/api/entries")
assert_contains "user2 sees own entry" "tu2 work" "$U2E"
assert_not_contains "user2 cannot see user1 entry" "tu1 work" "$U2E"

AE=$(http_body -b /tmp/cc-admin "$BASE/api/entries")
assert_contains "admin sees user1 entry" "tu1 work" "$AE"
assert_contains "admin sees user2 entry" "tu2 work" "$AE"
assert_contains "admin sees own entry" "admin work" "$AE"

U1_EID=$(echo "$U1E" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
assert "user2 cannot delete user1 entry" "403" "$(http_status -b /tmp/cc-tu2 -X DELETE "$BASE/api/entries/$U1_EID")"
assert "admin can delete user1 entry" "200" "$(http_status -b /tmp/cc-admin -X DELETE "$BASE/api/entries/$U1_EID")"

# ── Unauthenticated ────────────────────────────────
echo ""
echo "Unauthenticated Access"
assert "entries blocked" "401" "$(http_status "$BASE/api/entries")"
assert "customers blocked" "401" "$(http_status "$BASE/api/customers")"
assert "users blocked" "401" "$(http_status "$BASE/api/users")"

# ── Referential Integrity ──────────────────────────
echo ""
echo "Referential Integrity"
assert "cannot delete customer with entries" "409" "$(http_status -b /tmp/cc-tu2 -X DELETE "$BASE/api/customers/$U2C_ID")"

# ── Cleanup ────────────────────────────────────────
rm -f /tmp/cc-admin /tmp/cc-tu1 /tmp/cc-tu2

echo ""
echo "────────────────────────────"
printf "  ${GREEN}Passed: %d${NC}  " "$PASS"
if [ "$FAIL" -gt 0 ]; then
  printf "${RED}Failed: %d${NC}  " "$FAIL"
else
  printf "Failed: %d  " "$FAIL"
fi
echo "Total: $TOTAL"
echo "────────────────────────────"
echo ""
exit $FAIL
