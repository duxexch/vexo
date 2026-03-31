const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcrypt.hash('admin123', 12);
  await pool.query(
    'UPDATE users SET password = $1, failed_login_attempts = 0, locked_until = NULL WHERE username = $2 AND role = $3',
    [hash, 'admin', 'admin']
  );
  const r = await pool.query(
    "SELECT substring(password,1,7) as prefix FROM users WHERE username = 'admin' AND role = 'admin'"
  );
  console.log('Done. Hash prefix:', r.rows[0].prefix);
  pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
