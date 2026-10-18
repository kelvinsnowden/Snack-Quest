# Page performance harness

Measures what each important page costs on the server: time, Firestore round trips, documents read, and the longest chain of round trips that wait on each other ("depth"). Depth is what network latency multiplies: in production every step of that chain costs one Vercel → Firestore round trip.

Everything runs locally against the Firestore and Auth emulators. Nothing here touches a real project.

## Run it

```sh
# 1. Emulators
npx firebase emulators:start --only firestore,auth --project demo-project

# 2. The dataset: 20 machines, 30 slots each, 20,000 sales, 90 days of rollups,
#    traffic, recommendations, alerts, restocks, technician jobs. Writes session
#    cookies for a super admin, an owner and a technician.
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-project SNACK_QUEST_BUSINESS_ID=biz-perf PERF_COOKIES_FILE=perf-cookies.json \
  npx vitest run --config scripts/perf/vitest.config.ts

# 3. A production build, started with the tracer writing every round trip to a file
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-project ... npx next build --webpack
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true ... SNACK_QUEST_BUSINESS_ID=biz-perf \
  PERF_TRACE_FILE=/tmp/trace.jsonl npx next start -p 3124

# 4. The journeys (see journeys.example.json for the list and cookie names)
PERF_TRACE_FILE=/tmp/trace.jsonl node scripts/perf/measurePages.mjs journeys.json results.json 4
```

The first load of each page is reported separately (`coldTotalMs`); the other runs give the medians.

## Reading the numbers

- **Times on the emulator are not production times.** The emulator answers in about a millisecond; Firestore from Vercel's `cpt1` region takes a real round trip (`GET /api/internal/latency-probe` on a preview deployment measures it). Estimate production server time as `depth × round trip + Firebase Auth check` and compare pages by depth and documents read.
- `latencyProxy.mjs` can put a fixed delay in front of the emulator (`FIRESTORE_EMULATOR_HOST` pointed at the proxy) to see that effect directly.
- The tracer (`lib/observability/firestoreTrace.ts`) is also on in production, where it only logs single reads slower than 1.5 s or larger than 1,000 documents (`firestore.slow` lines in the Vercel logs).
