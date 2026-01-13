const db = require('../config/db');
const nowISO = new Date().toISOString();
// Utility to wrap sqlite3 queries in Promises
const runQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const getQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// The Model Methods
const TaskModel = {

  // ------------------------
  // Create Task + Audit
  // ------------------------
  create: async (task) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const nowISO = new Date().toISOString(); // ISO timestamp for creation & history

        const sqlInsertTask = `
          INSERT INTO tasks (title, description, status, due_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.run(
          sqlInsertTask,
          [
            task.title,
            task.description || '',
            task.status || 'PENDING',
            task.due_date || null,
            nowISO, // created_at
            nowISO  // updated_at
          ],
          function (err) {
            if (err) return db.run("ROLLBACK", () => reject(err));

            const taskId = this.lastID;

            const sqlInsertHistory = `
              INSERT INTO task_history (task_id, change_summary, changed_at)
              VALUES (?, ?, ?)
            `;

            db.run(sqlInsertHistory, [taskId, 'Task created', nowISO], function (err2) {
              if (err2) return db.run("ROLLBACK", () => reject(err2));

              db.run("COMMIT", (err3) => {
                if (err3) return reject(err3);

                // Fetch the newly created task
                db.get(`SELECT * FROM tasks WHERE id = ?`, [taskId], (err4, row) => {
                  if (err4) return reject(err4);

                  resolve({
                    ...row,
                    id: row.id,
                    title: row.title,
                    description: row.description,
                    status: row.status,
                    due_date: row.due_date,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    deleted_at: row.deleted_at || null
                  });
              });
            });
          });
        }
      );
    });
  });
},

  // ------------------------
  // Update Task + Audit
  // ------------------------
  update: async (id, task, changeSummary = null) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION", function (err) {
          if (err) return reject(err);

          const sqlUpdate = `
            UPDATE tasks
            SET title = ?, description = ?, status = ?, due_date = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
          `;

          db.run(
            sqlUpdate,
            [task.title, task.description, task.status, task.due_date, task.updated_at, id],
            function (errUpdate) {
              if (errUpdate) return db.run("ROLLBACK", () => reject(errUpdate));

              // Only insert history if changeSummary exists
              if (!changeSummary) {
                return db.run("COMMIT", function (errCommit) {
                  if (errCommit) return reject(errCommit);
                  TaskModel.findById(id).then(resolve).catch(reject);
                });
              }

              const sqlHistory = `
                INSERT INTO task_history (task_id, change_summary, changed_at)
                VALUES (?, ?, ?)
              `;
              db.run(sqlHistory, [id, changeSummary, new Date().toISOString()], function (errHistory) {
                if (errHistory) return db.run("ROLLBACK", () => reject(errHistory));

                db.run("COMMIT", function (errCommit) {
                  if (errCommit) return reject(errCommit);
                  TaskModel.findById(id).then(resolve).catch(reject);
                });
              });
            }
          );
        });
      });
    });
  },

  // ------------------------
  // Soft Delete Task + Audit
  // ------------------------
  delete: async (id) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const nowISO = new Date().toISOString(); // consistent ISO timestamp

        const sqlDelete = `
          UPDATE tasks
          SET deleted_at = ?
          WHERE id = ? AND deleted_at IS NULL
        `;

        db.run(sqlDelete, [nowISO, id], function (err) {
          if (err) return db.run("ROLLBACK", () => reject(err));

          const sqlHistory = `
            INSERT INTO task_history (task_id, change_summary, changed_at)
            VALUES (?, ?, ?)
          `;

          db.run(sqlHistory, [id, "Task deleted", nowISO], function (err2) {
            if (err2) return db.run("ROLLBACK", () => reject(err2));

            db.run("COMMIT", (err3) => {
              if (err3) return reject(err3);
              resolve({ deleted: true, id });
            });
          });
        });
      });
    });
  },

  // Enhanced Find All with Filtering and Sorting
  findAll: async ({ statusFilters = [], sortBy = 'due_date', sortOrder = 'ASC' } = {}) => {
    // 1. Security: Whitelist Sort Columns
    const validSorts = ['id', 'title', 'status', 'due_date', 'created_at'];
    const validOrders = ['ASC', 'DESC'];

    const safeSort = validSorts.includes(sortBy) ? sortBy : 'due_date';
    const safeOrder = validOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'ASC';

    // 2. Base Query
    let sql = `SELECT * FROM tasks WHERE deleted_at IS NULL`;
    const params = [];

    // 3. Status & Overdue Logic
    if (statusFilters.length > 0) {
      // Separate "Real" DB statuses from the "Virtual" OVERDUE status
      const isOverdueSelected = statusFilters.includes('OVERDUE');
      const dbStatuses = statusFilters.filter(s => s !== 'OVERDUE');

      const orConditions = [];

      // Logic A: Standard Statuses (PENDING, IN_PROGRESS, COMPLETED)
      if (dbStatuses.length > 0) {
        const placeholders = dbStatuses.map(() => '?').join(', ');
        orConditions.push(`status IN (${placeholders})`);
        params.push(...dbStatuses);
      }

      // Logic B: Overdue (Due date is in past AND not completed)
      // We pass the current ISO time to compare against the stored string
      if (isOverdueSelected) {
        orConditions.push(`(due_date < ? AND status != 'COMPLETED')`);
        params.push(new Date().toISOString());
      }

      // Combine A and B with OR (e.g. Show me PENDING tasks OR OVERDUE tasks)
      if (orConditions.length > 0) {
        sql += ` AND (${orConditions.join(' OR ')})`;
      }
    }

    // 4. Apply Sort
    sql += ` ORDER BY ${safeSort} ${safeOrder}`;

    return await getQuery(sql, params);
  },
  findById: async (id) => {
    // SECURITY: Prevent accessing a deleted task via direct URL
    const result = await getQuery(`SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`, [id]);
    return result[0];
  },

  update: async (id, task, changeSummary = null) => {
    return new Promise((resolve, reject) => {
      db.run("BEGIN TRANSACTION", function (err) {
        if (err) return reject(err);

        const sqlUpdate = `
          UPDATE tasks
          SET title = ?, description = ?, status = ?, due_date = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL
        `;

        db.run(
          sqlUpdate,
          [task.title, task.description, task.status, task.due_date, task.updated_at, id],
          function (err) {
            if (err) return db.run("ROLLBACK", () => reject(err));

            // Only insert history if changeSummary exists
            if (!changeSummary) {
              return db.run("COMMIT", function (err2) {
                if (err2) return reject(err2);
                TaskModel.findById(id).then(resolve).catch(reject);
              });
            }

            const sqlHistory = `
              INSERT INTO task_history (task_id, change_summary, changed_at)
              VALUES (?, ?, ?)
            `;

            db.run(sqlHistory, [id, changeSummary, new Date().toISOString()], function (err3) {
              if (err3) return db.run("ROLLBACK", () => reject(err3));

              db.run("COMMIT", function (err4) {
                if (err4) return reject(err4);
                TaskModel.findById(id).then(resolve).catch(reject);
              });
            });
          }
        );
      });
    });
  },

  delete: async (id) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const sqlDelete = `
          UPDATE tasks
          SET deleted_at = CURRENT_TIMESTAMP
          WHERE id = ? AND deleted_at IS NULL
        `;

        db.run(sqlDelete, [id], function (err) {
          if (err) return db.run("ROLLBACK", () => reject(err));

          const sqlHistory = `
            INSERT INTO task_history (task_id, change_summary)
            VALUES (?, ?)
          `;

          db.run(sqlHistory, [id, "Task deleted"], function (err2) {
            if (err2) return db.run("ROLLBACK", () => reject(err2));

            db.run("COMMIT", (errCommit) => {
              if (errCommit) return reject(errCommit);
              resolve({ deleted: true, id });
            });
          });
        });
      });
    });
  },
  // Audit History Method
  addHistory: async (taskId, summary) => {
    const sql = `
      INSERT INTO task_history (task_id, change_summary)
      VALUES (?, ?)
    `;
    return await runQuery(sql, [parseInt(taskId, 10), summary]);
  },

  // Fetch history for a specific task
  getHistory: (taskId) => {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * 
        FROM task_history 
        WHERE task_id = ? 
        ORDER BY changed_at DESC, id DESC
      `;
      db.all(sql, [parseInt(taskId, 10)], (err, rows) => {
        if (err) reject(err);
        else resolve(rows); // rows should have .change_summary and .changed_at
      });
    });
  }
};

module.exports = TaskModel;