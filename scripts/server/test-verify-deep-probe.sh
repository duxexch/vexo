#!/usr/bin/env bash
# test-verify-deep-probe.sh
# -----------------------------------------------------------------------------
# Regression test for the byte-level probe added to
# scripts/server/verify-vex-deployment.sh (Section 5b).
#
# The bug we are guarding against:
#   In the production incident the HEAD response from /downloads/<file>.apk
#   was perfect (HTTP 200, Content-Type: application/vnd.android.package-archive,
#   correct Content-Length) but every actual GET returned a 500 because
#   the file on disk was chmod 600 and the container could not read it.
#   Some intermediates rewrote that 500 to a 200 with an HTML body, so
#   the user downloaded an HTML page named VEX-1.0.0.apk and the install
#   failed with "There was a problem parsing the package".
#
#   The verifier said all-green, the user got HTML, and we lost hours
#   diagnosing.
#
# What this test does:
#   1. Spawns a tiny Node http server on 127.0.0.1:<random> that responds:
#      - GET /downloads/manifest.json → valid JSON
#      - HEAD /downloads/VEX-test.apk → HTTP 200 with PERFECT headers
#      - GET  /downloads/VEX-test.apk → HTTP 200 with HTML body (the bug)
#      - GET  /downloads/VEX-test.aab → HTTP 404
#      This is a faithful re-creation of what the production proxy did
#      during the chmod-000 incident.
#   2. Runs `verify-vex-deployment.sh --public-only` against that URL.
#   3. Asserts the verifier exits NON-ZERO. If it exits 0, the byte
#      probe regressed and the test fails.
#
# Run:
#   bash scripts/server/test-verify-deep-probe.sh
#
# Exit codes:
#   0  → byte probe correctly rejected the broken APK (regression test PASSED)
#   1  → byte probe accepted the broken APK (regression — fix it!)
#   2  → harness setup error (Node missing, port unavailable, etc.)
# -----------------------------------------------------------------------------
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "FATAL: node is required to run the broken-APK simulator" >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "FATAL: curl is required by the verifier under test" >&2
  exit 2
fi

# Pick a random high port and let Node fail-fast if it's taken.
PORT="${VEX_TEST_PORT:-$(( (RANDOM % 20000) + 40000 ))}"
TMPDIR="$(mktemp -d -t vex-deep-probe-test.XXXXXX)"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    # Give the process a beat to flush before SIGKILL.
    for _ in 1 2 3 4 5; do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 0.1
    done
    kill -9 "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMPDIR"
}
trap cleanup EXIT INT TERM

# -----------------------------------------------------------------------------
# Spawn the broken-APK simulator. Headers are PERFECT — body is HTML. This
# is exactly the production proxy behaviour we are guarding against.
# -----------------------------------------------------------------------------
node - "$PORT" >"$TMPDIR/server.log" 2>&1 <<'NODE' &
const http = require('http');
const port = parseInt(process.argv[2], 10);

// The verifier defaults to APK name "app.apk" when there is no manifest
// on disk to consult (the --public-only test runs against a bare temp dir).
// Keep the simulator aligned with that default so the byte probe targets
// the broken endpoint we set up below.
const APK_NAME = 'app.apk';
const AAB_NAME = 'app.aab';

// HTML body that some proxies synthesise on top of an upstream 500. ~200B
// is enough to be obviously not an APK without being absurdly small.
const FAKE_HTML_BODY = Buffer.from(
  '<!DOCTYPE html><html><head><title>500 Internal Server Error</title></head>' +
  '<body><h1>500 Internal Server Error</h1><p>upstream returned EACCES while ' +
  'reading /docker/vex/client/public/downloads/' + APK_NAME + '</p></body></html>'
);

// We claim a multi-MB file via Content-Length so the verifier's range probe
// has a non-trivial expectation. The real body is much smaller — that
// length mismatch is one of the secondary signals the byte probe checks.
const CLAIMED_APK_LENGTH = 6_000_000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (url.pathname === '/downloads/manifest.json') {
    const body = JSON.stringify({
      version: '0.0.1-test',
      apkFile: APK_NAME,
      apkUrl: '/downloads/' + APK_NAME,
      apkSize: CLAIMED_APK_LENGTH,
      apkSha256: 'x',
      aabFile: AAB_NAME,
      aabSize: CLAIMED_APK_LENGTH,
      aabSha256: 'x',
      releasedAt: new Date().toISOString(),
    });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }

  // Two URL shapes are recognised so the verifier (which appends
  // `/downloads/<apk>` to whatever VEX_PUBLIC_URL it's given) can pick a
  // mode without us having to teach the verifier about query strings:
  //   /downloads/<apk>        → PERFECT headers (the headline incident)
  //   /no-ct/downloads/<apk>  → headers WITHOUT Content-Type (regression
  //                              case for the pipefail / grep silent-exit
  //                              bug found in code review)
  const noCtPath = '/no-ct/downloads/' + APK_NAME;
  const okPath   = '/downloads/' + APK_NAME;
  if (url.pathname === okPath || url.pathname === noCtPath) {
    const omitContentType = url.pathname === noCtPath;
    const headers = omitContentType
      ? {
          'Content-Length': String(CLAIMED_APK_LENGTH),
          'Content-Disposition': 'attachment; filename="' + APK_NAME + '"',
        }
      : {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': String(CLAIMED_APK_LENGTH),
          'Content-Disposition': 'attachment; filename="' + APK_NAME + '"',
        };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    // BROKEN body — the silent failure mode that motivated the byte probe.
    // We honour neither the advertised Content-Length nor the request's
    // Range header, on purpose: that mimics the upstream rewrite case
    // where the proxy sends its own error body in front of any range
    // request the client tried.
    //
    // We deliberately UNDER-SEND vs. the advertised Content-Length (~6 MB).
    // That short-write makes curl exit 18 ("transfer closed with N bytes
    // remaining"), which is the production-incident transport signal the
    // probe is required to report. The probe must:
    //   1) capture curl's real exit code (not the post-substitution shell's),
    //   2) emit an info line for exit 18 specifically,
    //   3) still inspect the bytes that did arrive and fail on bad magic.
    res.writeHead(200, headers);
    res.end(FAKE_HTML_BODY);
    return;
  }

  if (url.pathname === '/downloads/' + AAB_NAME) {
    // Match production behaviour: AAB is admin-only and should 404 publicly.
    res.writeHead(404);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(port, '127.0.0.1', () => {
  // Print a sentinel the parent shell can grep for to confirm readiness.
  process.stderr.write(`READY ${port}\n`);
});
server.on('error', (err) => {
  process.stderr.write(`SERVER_ERROR ${err.code || err.message}\n`);
  process.exit(1);
});
NODE
SERVER_PID=$!

# Wait up to 5 s for the server to advertise readiness via stderr.
ready=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if grep -q "^READY ${PORT}" "$TMPDIR/server.log" 2>/dev/null; then
    ready="yes"
    break
  fi
  if grep -q "^SERVER_ERROR" "$TMPDIR/server.log" 2>/dev/null; then
    echo "FATAL: simulator failed to start:" >&2
    cat "$TMPDIR/server.log" >&2
    exit 2
  fi
  sleep 0.5
done

if [ -z "$ready" ]; then
  echo "FATAL: simulator did not become ready within 5 s. Server log:" >&2
  cat "$TMPDIR/server.log" >&2
  exit 2
fi

echo "── broken-APK simulator listening on http://127.0.0.1:${PORT}"
echo "── scenario A: running verify-vex-deployment.sh --public-only against the perfect-headers / HTML-body simulator"
echo

# -----------------------------------------------------------------------------
# Scenario A — the headline incident: HEAD looks perfect, GET returns HTML.
# The verifier must exit non-zero, name the offending file, run section 5b,
# and surface the curl-exit-18 truncated-transfer info line.
# -----------------------------------------------------------------------------
verify_log="$TMPDIR/verify.log"
VEX_PUBLIC_URL="http://127.0.0.1:${PORT}" \
VEX_DOWNLOADS_DIR="$TMPDIR/downloads" \
  bash "$REPO_ROOT/scripts/server/verify-vex-deployment.sh" --public-only \
    >"$verify_log" 2>&1
verify_exit=$?

cat "$verify_log"
echo
echo "── scenario A: verify exited with code: ${verify_exit}"

# -----------------------------------------------------------------------------
# Assertions.
# -----------------------------------------------------------------------------
fail=0

if [ "$verify_exit" -eq 0 ]; then
  echo "FAIL: verifier exited 0 against a broken APK. The byte probe regressed." >&2
  fail=1
else
  echo "PASS: verifier exited non-zero (${verify_exit}) on the broken APK"
fi

# The diagnostic must mention the offending file path, per the task spec.
# Section 5b prints "Offending file: ${APK_PATH}" — we look for the APK
# filename the simulator serves (matches the verifier's default when no
# manifest is on disk).
if ! grep -q "app.apk" "$verify_log"; then
  echo "FAIL: verify output did not name the offending file (looked for 'app.apk')" >&2
  fail=1
else
  echo "PASS: verify output names the offending file path"
fi

# Confirm the byte probe specifically fired (not just an unrelated section).
if ! grep -q "5b\." "$verify_log"; then
  echo "FAIL: section 5b (byte probe) did not run — check --public-only wiring" >&2
  fail=1
else
  echo "PASS: section 5b (byte probe) ran"
fi

# Confirm the curl exit-code path actually fired (the bug found in code
# review was that `$?` after command substitution + trailing echo always
# read 0, so the truncated-transfer branch was unreachable). The Node
# simulator under-sends vs. its advertised Content-Length, which makes
# curl exit 18; the probe must surface that as an info line.
if ! grep -q "curl exited 18" "$verify_log"; then
  echo "FAIL: curl exit-code capture regressed — probe never reported the truncated transfer (curl exit 18)." >&2
  echo "      This means the curl exit code is being lost at the shell layer (the bug surfaced by code review)." >&2
  fail=1
else
  echo "PASS: probe correctly captured and reported curl exit 18 (truncated transfer)"
fi

echo
echo "── scenario B: verifier against the SAME simulator with Content-Type stripped (proxy-rewrite case)"
echo "── This is the regression case for the pipefail / grep-no-match silent-exit bug found in code review."
echo

# -----------------------------------------------------------------------------
# Scenario B — malformed headers. The simulator's APK endpoint accepts a
# `?mode=no-ct` query string and omits Content-Type from the response. The
# verifier's parse step uses `grep -oE 'content_type=[^ ]+'` which exits 1
# when the field is absent — under `set -o pipefail` (the script's mode)
# that propagates and, if any errexit-style protection is active, kills
# the script silently. The regression assertion is: the verifier must
# still reach the Summary block and emit a normal failure message.
# -----------------------------------------------------------------------------
verify_log_b="$TMPDIR/verify-no-ct.log"
# The simulator routes /no-ct/downloads/<apk> to the headers-without-CT
# branch. We point VEX_PUBLIC_URL at the /no-ct prefix so the verifier's
# default URL composition (PUBLIC_URL + '/downloads/' + APK_NAME) lands
# on the malformed-headers endpoint without changing the verifier itself.
VEX_PUBLIC_URL="http://127.0.0.1:${PORT}/no-ct" \
VEX_DOWNLOADS_DIR="$TMPDIR/downloads" \
  bash "$REPO_ROOT/scripts/server/verify-vex-deployment.sh" --public-only \
    >"$verify_log_b" 2>&1
verify_exit_b=$?

cat "$verify_log_b"
echo
echo "── scenario B: verify exited with code: ${verify_exit_b}"

# Scenario B assertion: the script must NOT silently exit before the
# Summary block. We allow either a fail (best) or a pass+warn — what we
# refuse to tolerate is "ran section 5b, then died with no output below".
if ! grep -q "^== Summary ==" "$verify_log_b"; then
  echo "FAIL: scenario B silently terminated before Summary — pipefail/grep silent-exit bug regressed." >&2
  echo "      The verifier must always reach the Summary block, even when proxy headers are malformed." >&2
  fail=1
else
  echo "PASS: scenario B reached the Summary block without silent termination"
fi

# Lock down that scenario B actually exercised the no-Content-Type code
# path (not just any code path that reaches Summary). The 5b body-magic
# fail message embeds `body content-type=<value>`; a missing CT header
# renders as `body content-type=unknown`. If this assertion ever fails,
# someone changed the simulator wiring and the no-CT regression coverage
# is silently gone.
if ! grep -q "body content-type=unknown" "$verify_log_b"; then
  echo "FAIL: scenario B did not exercise the no-Content-Type code path." >&2
  echo "      Expected the byte probe to report 'body content-type=unknown' but it didn't." >&2
  echo "      Check that the simulator's /no-ct/downloads/<apk> route is wired correctly." >&2
  fail=1
else
  echo "PASS: scenario B confirmed the no-Content-Type path runs end-to-end"
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "REGRESSION TEST FAILED — fix scripts/server/verify-vex-deployment.sh" >&2
  exit 1
fi

echo
echo "✓ regression test PASSED — byte probe correctly rejects the production-incident scenario"
exit 0
