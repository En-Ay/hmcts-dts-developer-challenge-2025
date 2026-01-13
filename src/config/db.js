const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../tasks.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error opening database ' + dbPath, err.message);
  else console.log('Connected to the SQLite database.');
});

db.serialize(() => {
  // Enable foreign key constraints
  db.run("PRAGMA foreign_keys = ON");

  // 1. Tasks Table (with soft delete column)
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      due_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      deleted_at DATETIME -- Soft delete timestamp
    )
  `);

  // 2. Task History Table (Audit Log)
  db.run(`
    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      change_summary TEXT NOT NULL,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    )
  `);

  // Optional: index for faster lookup by task
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_task_history_task_id 
    ON task_history(task_id)
  `);
});

module.exports = db;