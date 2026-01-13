const request = require('supertest');
const app = require('../src/app'); 
const db = require('../src/config/db');

beforeEach(async () => {
  // Clean DB before each test
  await db.run("DELETE FROM task_history");
  await db.run("DELETE FROM tasks");
});

describe('HMCTS Task API Integration Tests', () => {

  // Helper to create a task
  const createTask = async (overrides = {}) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const taskData = {
      title: 'Integration Test Task',
      description: 'Created by Jest',
      status: 'PENDING',
      due_date: tomorrow.toISOString(),
      ...overrides
    };

    const res = await request(app).post('/api/tasks').send(taskData);
    expect(res.statusCode).toBe(201);
    return res.body;
  };

  // Helper to fetch task history
  const fetchHistory = async (taskId) => {
    const res = await request(app).get(`/api/tasks/${taskId}/history`);
    expect(res.statusCode).toBe(200);
    return res.body;
  };

  // 1. Create a task
  it('POST /api/tasks - should create a new task', async () => {
    const task = await createTask();
    const history = await fetchHistory(task.id);

    console.log('Test 1 - Created Task:', task);
    console.log('Test 1 - History:', history);

    expect(history.length).toBe(1);
    expect(history[0].summary).toContain('Task created');
  });

  // 2. Create without title
  it('POST /api/tasks - should fail if title is missing', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app).post('/api/tasks').send({
      description: 'No title',
      due_date: tomorrow.toISOString()
    });

    console.log('Test 2 - Response:', res.body);

    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].path[0]).toBe('title');
  });

  // 3. Past due date
  it('POST /api/tasks - should block tasks with past due dates', async () => {
    const res = await request(app).post('/api/tasks').send({
      title: 'Invalid Task',
      due_date: '1990-01-01'
    });

    console.log('Test 3 - Response:', res.body);

    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].message).toContain("Due date");
  });

  // 4. Unsafe characters
  it('POST /api/tasks - should block titles with unsafe characters', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app).post('/api/tasks').send({
      title: 'Malicious <script>alert(1)</script>',
      due_date: tomorrow.toISOString()
    });

    console.log('Test 4 - Response:', res.body);

    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].message).toContain("invalid characters");
  });

  // 5. International characters
  it('POST /api/tasks - should accept titles with international characters', async () => {
    const task = await createTask({ title: "Case Review: Renée & Noël (Åsa's File)" });
    const history = await fetchHistory(task.id);

    console.log('Test 5 - Created Task:', task);
    console.log('Test 5 - History:', history);

    expect(task.title).toBe("Case Review: Renée & Noël (Åsa's File)");
    expect(history.length).toBe(1);
    });
  // 6. Update status and save history
  it('PUT /api/tasks/:id - should update task status and save history', async () => {
    const task = await createTask();

    // Update status
    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.statusCode).toBe(200);

    // Fetch history
    const history = await fetchHistory(task.id);
    console.log('Test 6 - History after status update:', history);

    expect(history.length).toBe(2); // Task created + Status changed
    expect(history[0].summary).toContain('Status changed');
  });

  // 7. Update title and description
  it('PUT /api/tasks/:id - should update title and description with combined history', async () => {
    const task = await createTask();

    const updates = { title: 'Updated Title', description: 'Updated Description' };
    const res = await request(app).put(`/api/tasks/${task.id}`).send(updates);
    expect(res.statusCode).toBe(200);

    const history = await fetchHistory(task.id);
    console.log('Test 7 - History after title/description update:', history);

    expect(history.length).toBe(2); // Task created + combined change
    expect(history[0].summary).toContain('Title changed');
    expect(history[0].summary).toContain('Description changed');
  });
  // 8. Update with past date
  it('PUT /api/tasks/:id - should block updates to past dates', async () => {
    const task = await createTask();

    const res = await request(app).put(`/api/tasks/${task.id}`).send({ due_date: '1995-05-05' });
    console.log('Test 8 - Response:', res.body);

    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].message).toContain("Due date");
  });

  // 9. Remove title
  it('PUT /api/tasks/:id - should block removing the title', async () => {
    const task = await createTask();

    const res = await request(app).put(`/api/tasks/${task.id}`).send({ title: '' });
    console.log('Test 9 - Response:', res.body);

    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].path[0]).toBe('title');
  });

  // 10. Get history
  it('GET /api/tasks/:id/history - should retrieve all audit logs', async () => {
    const task = await createTask();
    await request(app).put(`/api/tasks/${task.id}`).send({ status: 'IN_PROGRESS' });
    await request(app).put(`/api/tasks/${task.id}`).send({ title: 'Updated Title', description: 'Updated Description' });

    const history = await fetchHistory(task.id);
    console.log('Test 10 - History:', history);

    expect(history.length).toBe(3);
    history.forEach(entry => {
      expect(entry).toHaveProperty('summary');
      expect(entry).toHaveProperty('changed_at');
    });
  });

  // 11. Soft delete API
  it('DELETE /api/tasks/:id - should soft delete the task', async () => {
    const task = await createTask();

    const delRes = await request(app).delete(`/api/tasks/${task.id}`);
    const getRes = await request(app).get(`/api/tasks/${task.id}`);

    console.log('Test 11 - Delete Response:', delRes.statusCode);
    console.log('Test 11 - Get After Delete:', getRes.statusCode);

    expect(delRes.statusCode).toBe(204);
    expect(getRes.statusCode).toBe(404);
  });

  // 12. Soft delete DB check
  it('Internal DB Check - deleted task should still exist in DB (Soft Delete)', async () => {
    const task = await createTask();
    await request(app).delete(`/api/tasks/${task.id}`);

    const row = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM tasks WHERE id = ?`, [task.id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    console.log('Test 12 - Soft Deleted Task:', row);

    expect(row).toBeDefined();
    expect(row.deleted_at).not.toBeNull();
  });
  // 13. Direct DB history check
  it('Direct DB check for task_history', async () => {
    const task = await createTask();
    await request(app).put(`/api/tasks/${task.id}`).send({ status: 'IN_PROGRESS' });

    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM task_history WHERE task_id = ? ORDER BY id`,
        [task.id],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });

    console.log('Test 13 - Task History Rows:', rows);

    expect(rows.length).toBe(2);
    expect(rows[0].change_summary).toContain('Task created');
    expect(rows[1].change_summary).toContain('Status changed');
  });

  // Close DB
  afterAll(async () => {
    await new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
});
