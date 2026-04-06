#!/usr/bin/env bash

# Backward-compatible wrapper
# Existing operators using ./scripts/deploy.sh will automatically use
# the new idempotent production bootstrap/deploy flow.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/prod-auto.sh" "$@"
