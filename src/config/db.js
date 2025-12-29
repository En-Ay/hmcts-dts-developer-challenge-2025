const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../tasks.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error opening database ' + dbPath, err.message);
  else console.log('Connected to the SQLite database.');
});

db.serialize(() => {
// 1. Tasks Table (Now with deleted_at)
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    due_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    deleted_at DATETIME  -- New Column for Soft Delete
  )`);

  // 2. Task History Table (The Audit Log)
  db.run(`CREATE TABLE IF NOT EXISTS task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    change_summary TEXT NOT NULL,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(task_id) REFERENCES tasks(id)
  )`);
});

module.exports = db;