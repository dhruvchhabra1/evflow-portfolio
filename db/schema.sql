CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL,
  description TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  version INTEGER NOT NULL, r2_key TEXT NOT NULL, filename TEXT NOT NULL,
  size INTEGER, content_type TEXT, uploaded_by TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_versions_doc ON versions(document_id);
