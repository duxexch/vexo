#!/bin/sh
# VEX Platform - Docker Entrypoint Script
# Production-safe database migrations and startup

set -e

echo "========================================"
echo "  VEX Platform - Starting Up"
echo "  Environment: ${NODE_ENV:-development}"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

# ─── Validate required environment variables ───
echo ""
echo "[1/5] Validating environment..."

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is required"
    exit 1
fi
echo "  DATABASE_URL: set"

if [ -z "$SESSION_SECRET" ]; then
    echo "ERROR: SESSION_SECRET is required"
    exit 1
fi

if [ "$NODE_ENV" = "production" ]; then
    SECRET_LENGTH=${#SESSION_SECRET}
    if [ "$SECRET_LENGTH" -lt 32 ]; then
        echo "ERROR: SESSION_SECRET must be at least 32 characters (current: $SECRET_LENGTH)"
        exit 1
    fi
fi
echo "  SESSION_SECRET: set"

if [ -z "$JWT_USER_SECRET" ]; then
    # Fallback: check legacy JWT_SIGNING_KEY env var name
    if [ -n "$JWT_SIGNING_KEY" ]; then
        export JWT_USER_SECRET="$JWT_SIGNING_KEY"
    else
        echo "ERROR: JWT_USER_SECRET (or JWT_SIGNING_KEY) is required"
        exit 1
    fi
fi
if [ "$NODE_ENV" = "production" ]; then
    JWT_LENGTH=${#JWT_USER_SECRET}
    if [ "$JWT_LENGTH" -lt 32 ]; then
        echo "ERROR: JWT_USER_SECRET must be at least 32 characters (current: $JWT_LENGTH)"
        exit 1
    fi
fi
echo "  JWT_USER_SECRET: set"

# Support both env var names: JWT_ADMIN_SECRET (code) and ADMIN_JWT_SECRET (legacy)
ADMIN_SECRET="${JWT_ADMIN_SECRET:-$ADMIN_JWT_SECRET}"
if [ -z "$ADMIN_SECRET" ]; then
    echo "ERROR: JWT_ADMIN_SECRET (or ADMIN_JWT_SECRET) is required"
    exit 1
fi
if [ "$NODE_ENV" = "production" ]; then
    ADMIN_SECRET_LENGTH=${#ADMIN_SECRET}
    if [ "$ADMIN_SECRET_LENGTH" -lt 32 ]; then
        echo "ERROR: JWT_ADMIN_SECRET must be at least 32 characters (current: $ADMIN_SECRET_LENGTH)"
        exit 1
    fi
fi
# Export so Node.js can read it
export JWT_ADMIN_SECRET="$ADMIN_SECRET"
echo "  JWT_ADMIN_SECRET: set"

if [ "$NODE_ENV" = "production" ] && [ "$ALLOW_FORCE_MIGRATIONS" = "true" ]; then
    echo "  WARNING: ALLOW_FORCE_MIGRATIONS=true in production!"
fi

EMAIL_PROVIDER_NORMALIZED=$(echo "${EMAIL_PROVIDER:-console}" | tr '[:upper:]' '[:lower:]')
if [ "$EMAIL_PROVIDER_NORMALIZED" = "smtp" ]; then
    missing_smtp=""
    for key in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM; do
        eval "value=\${$key}"
        if [ -z "$value" ]; then
            if [ -z "$missing_smtp" ]; then
                missing_smtp="$key"
            else
                missing_smtp="$missing_smtp, $key"
            fi
        fi
    done
    if [ -n "$missing_smtp" ]; then
        echo "ERROR: EMAIL_PROVIDER=smtp but missing required vars: $missing_smtp"
        exit 1
    fi
    echo "  EMAIL_PROVIDER: smtp (configured)"
elif [ "$EMAIL_PROVIDER_NORMALIZED" = "sendgrid" ]; then
    missing_sendgrid=""
    for key in SENDGRID_API_KEY SENDGRID_FROM; do
        eval "value=\${$key}"
        if [ -z "$value" ]; then
            if [ -z "$missing_sendgrid" ]; then
                missing_sendgrid="$key"
            else
                missing_sendgrid="$missing_sendgrid, $key"
            fi
        fi
    done
    if [ -n "$missing_sendgrid" ]; then
        echo "ERROR: EMAIL_PROVIDER=sendgrid but missing required vars: $missing_sendgrid"
        exit 1
    fi
    echo "  EMAIL_PROVIDER: sendgrid (configured)"
else
    if [ "$NODE_ENV" = "production" ]; then
        echo "  WARNING: EMAIL_PROVIDER=$EMAIL_PROVIDER_NORMALIZED (email delivery disabled or non-remote provider)"
    else
        echo "  EMAIL_PROVIDER: $EMAIL_PROVIDER_NORMALIZED"
    fi
fi

# ─── Extract DB connection info ───
if [ -z "$PGHOST" ]; then
    export PGHOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:\/]*\).*/\1/p')
    export PGPORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    export PGUSER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    export PGDATABASE=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
fi
PGPORT="${PGPORT:-5432}"

echo ""
echo "[2/5] Connecting to database..."
echo "  Host: $PGHOST:$PGPORT  DB: $PGDATABASE"

# ─── Wait for database ───
max_retries=30
counter=0
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" 2>/dev/null; do
    counter=$((counter + 1))
    if [ $counter -gt $max_retries ]; then
        echo "ERROR: Database connection timeout after $max_retries attempts"
        exit 1
    fi
    echo "  Attempt $counter/$max_retries — waiting..."
    sleep 2
done
echo "  Database connected!"

# ─── Database migrations ───
echo ""
echo "[3/5] Database migrations..."

# Pre-migration: normalize FK constraint names to match Drizzle schema
# This runs once-style fixes for constraints whose auto-generated names
# exceeded PostgreSQL's 63-char identifier limit (now fixed with explicit names)
echo "  Running pre-migration constraint fixes..."
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=0 <<'FIXSQL' 2>/dev/null || true
-- Rename old truncated constraint to new explicit short name (idempotent)
DO $$
BEGIN
  -- Fix: challenge_chat_messages.session_id FK (was 64 chars, truncated)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'challenge_chat_messages_session_id_challenge_game_sessions_id_f' AND table_name = 'challenge_chat_messages') THEN
    ALTER TABLE challenge_chat_messages RENAME CONSTRAINT challenge_chat_messages_session_id_challenge_game_sessions_id_f TO ccm_session_id_fk;
  END IF;
  -- Fix: project_currency_ledger.wallet_id FK (was 64 chars, truncated)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'project_currency_ledger_wallet_id_project_currency_wallets_id_f' AND table_name = 'project_currency_ledger') THEN
    ALTER TABLE project_currency_ledger RENAME CONSTRAINT project_currency_ledger_wallet_id_project_currency_wallets_id_f TO pcl_wallet_id_fk;
  END IF;
END $$;
FIXSQL
echo "  Pre-migration fixes applied"

if [ "$SKIP_MIGRATIONS" = "true" ]; then
    echo "  SKIP_MIGRATIONS=true — skipping"
else
    # Timeout for migrations (default 120s) to prevent hanging on large schemas
    MIGRATION_TIMEOUT="${MIGRATION_TIMEOUT:-120}"
    echo "  Running migrations (--force, timeout=${MIGRATION_TIMEOUT}s)..."

    # Run drizzle-kit push with a timeout to prevent infinite hangs
    migration_success=false
    if timeout "$MIGRATION_TIMEOUT" npx drizzle-kit push --force 2>&1; then
        echo "  Migrations completed"
        migration_success=true
    else
        exit_code=$?
        if [ "$exit_code" = "143" ] || [ "$exit_code" = "124" ]; then
            echo "  WARNING: Migrations timed out after ${MIGRATION_TIMEOUT}s"
            echo "  This usually means the schema is already in sync."
            echo "  Set SKIP_MIGRATIONS=true to skip in future restarts."
        else
            echo "  WARNING: Migrations returned exit code $exit_code"
            echo "  Retrying once..."
            if timeout "$MIGRATION_TIMEOUT" npx drizzle-kit push --force 2>&1; then
                echo "  Migrations completed (retry)"
                migration_success=true
            else
                echo "  WARNING: Migrations failed on retry (non-fatal)"
                echo "  Server will start anyway — schema may already be in sync."
            fi
        fi
    fi

    # Don't exit on migration failure — the schema is likely already applied
    # The server will fail at runtime if tables are actually missing
    if [ "$migration_success" = "false" ]; then
        echo "  Continuing without successful migration..."
    fi
fi

# ─── Database seeding ───
echo ""
echo "[4/5] Database seeding..."

if [ "$SEED_DATABASE" = "true" ]; then
    if [ -f "dist/scripts/seed-data.js" ]; then
        if node dist/scripts/seed-data.js 2>&1; then
            echo "  Seeding completed"
        else
            echo "  WARNING: Seeding failed (non-fatal)"
        fi
    elif command -v npx >/dev/null 2>&1; then
        if npx --yes tsx scripts/seed-data.ts 2>&1; then
            echo "  Seeding completed"
        else
            echo "  WARNING: Seeding failed (non-fatal)"
        fi
    else
        echo "  Skipping: no seed script available"
    fi
else
    echo "  SEED_DATABASE != true — skipping"
fi

# ─── Start application ───
echo ""
echo "[5/5] Starting VEX Platform..."
echo "========================================"
echo "  Port: ${PORT:-3001}"
echo "  Node: $(node --version)"
echo "  PID: $$"
echo "========================================"
echo ""

# Start with exec for proper signal handling (tini as PID 1)
exec node dist/index.cjs
