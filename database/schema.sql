CREATE TABLE IF NOT EXISTS borrowers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  chain TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'aave',
  health_factor TEXT,
  collateral_usd TEXT,
  debt_usd TEXT,
  last_checked INTEGER,
  UNIQUE(address, chain, protocol)
);

CREATE TABLE IF NOT EXISTS executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT,
  chain TEXT,
  protocol TEXT,
  strategy TEXT,
  borrower TEXT,
  collateral_asset TEXT,
  debt_asset TEXT,
  profit_usdc TEXT,
  gas_used TEXT,
  status TEXT DEFAULT 'pending',
  error_msg TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE,
  usdc_amount TEXT,
  gmd_amount TEXT,
  transfer_id TEXT,
  status TEXT DEFAULT 'pending',
  reference TEXT,
  error TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS treasury (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chain TEXT,
  token TEXT,
  balance TEXT,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS protocols_integrated (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  address TEXT,
  chain TEXT,
  tvl_usd TEXT,
  revenue_share REAL DEFAULT 0.5,
  status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS apex_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subsystem TEXT,
  action TEXT,
  result TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS x7usd (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT,
  amount TEXT,
  address TEXT,
  tx_hash TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_borrowers_hf ON borrowers(health_factor);
CREATE INDEX IF NOT EXISTS idx_borrowers_chain ON borrowers(chain);
CREATE INDEX IF NOT EXISTS idx_executions_chain ON executions(chain);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
