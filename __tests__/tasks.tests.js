const request = require('supertest');
const app = require('../src/app'); 
const db = require('../src/config/db');
beforeEach(async () => {
  await db.run("DELETE FROM task_history");
  await db.run("DELETE FROM tasks");
});
describe('HMCTS Task API Integration Tests', () => {
  let testTaskId;

  // 1. HAPPY PATH: Create a Task
  it('POST /api/tasks - should create a new task', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Integration Test Task',
        description: 'Created by Jest',
        status: 'PENDING',
        due_date: tomorrow.toISOString()
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('id');
    testTaskId = res.body.id;

    // --- Check that initial history row exists ---
    const historyRes = await request(app).get(`/api/tasks/${testTaskId}/history`);
    expect(historyRes.statusCode).toEqual(200);
    expect(historyRes.body.length).toBe(1); // Only "Task created" initially
    expect(historyRes.body[0].summary).toContain('Task created');
  });

  // 2. VALIDATION: Create without Title
  it('POST /api/tasks - should fail if title is missing', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app)
      .post('/api/tasks')
      .send({
        description: 'I have no title',
        due_date: tomorrow.toISOString()
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.errors[0].path[0]).toEqual('title');
  });

  // 3. VALIDATION: Past Due Date
  it('POST /api/tasks - should block tasks with past due dates', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Invalid Task',
        due_date: '1990-01-01' 
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.errors[0].message).toEqual("Due date must be a valid ISO string");
  });

  // 4. SECURITY VALIDATION: Invalid Characters
  it('POST /api/tasks - should block titles with unsafe characters', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Malicious <script>alert(1)</script>',
        due_date: tomorrow.toISOString()
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.errors[0].message).toContain("Title contains invalid characters");
  });

  // 5. INCLUSION VALIDATION: International Characters
  it('POST /api/tasks - should accept titles with international characters', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: "Case Review: Renée & Noël (Åsa's File)",
        status: 'PENDING',
        due_date: tomorrow.toISOString()
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.title).toEqual("Case Review: Renée & Noël (Åsa's File)");
  });

  // 6. HAPPY PATH: Update Status (Generates History)
  it('PUT /api/tasks/:id - should update task status and save history', async () => {
    const res = await request(app)
      .put(`/api/tasks/${testTaskId}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('IN_PROGRESS');

    const historyRes = await request(app).get(`/api/tasks/${testTaskId}/history`);
    expect(historyRes.statusCode).toEqual(200);
    expect(historyRes.body.length).toBeGreaterThanOrEqual(2);

    const lastEntry = historyRes.body[historyRes.body.length - 1];
    expect(lastEntry.summary).toContain('Status changed');
    expect(lastEntry).toHaveProperty('changed_at');
  });

  // 7. Update multiple fields (Title + Description)
  it('PUT /api/tasks/:id - should update multiple fields and create combined history', async () => {
    const res = await request(app)
      .put(`/api/tasks/${testTaskId}`)
      .send({
        title: 'Integration Test Task Updated',
        description: 'Updated description'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.title).toEqual('Integration Test Task Updated');
    expect(res.body.description).toEqual('Updated description');

    const historyRes = await request(app).get(`/api/tasks/${testTaskId}/history`);
    expect(historyRes.statusCode).toEqual(200);
    expect(historyRes.body.length).toBeGreaterThanOrEqual(3);

    const lastEntry = historyRes.body[historyRes.body.length - 1];
    expect(lastEntry.summary).toContain("Title changed");
    expect(lastEntry.summary).toContain("Description changed");
  });

  // 8. Validation: Update past date
  it('PUT /api/tasks/:id - should block updates to past dates', async () => {
    const res = await request(app)
      .put(`/api/tasks/${testTaskId}`)
      .send({ due_date: '1995-05-05' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.errors[0].message).toEqual("Due date must be a valid ISO string");
  });

  // 9. Validation: Remove title
  it('PUT /api/tasks/:id - should block removing the title', async () => {
    const res = await request(app)
      .put(`/api/tasks/${testTaskId}`)
      .send({ title: '' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.errors[0].path[0]).toEqual('title');
  });

  // 10. Audit Trail: Get history
  it('GET /api/tasks/:id/history - should retrieve all audit logs', async () => {
    const res = await request(app).get(`/api/tasks/${testTaskId}/history`);
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body.length).toBeGreaterThanOrEqual(3);

    res.body.forEach(entry => {
      expect(entry).toHaveProperty('summary');
      expect(entry).toHaveProperty('changed_at');
    });
  });

  // 11. Soft delete API check
  it('DELETE /api/tasks/:id - should soft delete the task', async () => {
    const delRes = await request(app).delete(`/api/tasks/${testTaskId}`);
    expect(delRes.statusCode).toEqual(204);

    const getRes = await request(app).get(`/api/tasks/${testTaskId}`);
    expect(getRes.statusCode).toEqual(404);
  });

  // 12. Soft delete DB check
  it('Internal DB Check - deleted task should still exist in DB (Soft Delete)', async () => {
    const row = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM tasks WHERE id = ?`, [testTaskId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    expect(row).toBeDefined();
    expect(row.title).toEqual('Integration Test Task Updated');
    expect(row.deleted_at).not.toBeNull();
  });
  // 13. Check history immediately after creation
  it('Initial history row is correct', async () => {
    const historyRes = await request(app).get(`/api/tasks/${testTaskId}/history`);
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.body.length).toBe(1);

    const entry = historyRes.body[0];
    expect(entry).toHaveProperty('summary');
    expect(entry).toHaveProperty('changed_at');

    // Log the entry for debugging
    console.log('Initial history entry:', entry);
  });
  // 14. Verify update generates history even for a single field
  it('Updating only status should create correct history entry', async () => {
    const newStatus = 'IN_PROGRESS';
    await request(app)
      .put(`/api/tasks/${testTaskId}`)
      .send({ status: newStatus })
      .expect(200);

    const historyRes = await request(app).get(`/api/tasks/${testTaskId}/history`);
    expect(historyRes.statusCode).toBe(200);

    // Should now be 2 rows
    expect(historyRes.body.length).toBeGreaterThanOrEqual(2);

    const lastEntry = historyRes.body[historyRes.body.length - 1];
    expect(lastEntry.summary).toContain('Status changed');

    // Log for clarity
    console.log('Status update history entry:', lastEntry);
  });
  // 15. Verify multi-field update generates combined summary
  it('Updating title and description should create combined history entry', async () => {
    const updates = {
      title: 'Updated Title',
      description: 'Updated Description'
    };
    await request(app)
      .put(`/api/tasks/${testTaskId}`)
      .send(updates)
      .expect(200);

    const historyRes = await request(app).get(`/api/tasks/${testTaskId}/history`);
    const lastEntry = historyRes.body[historyRes.body.length - 1];

    // Make sure combined summary exists
    expect(lastEntry.summary).toContain('Title changed');
    expect(lastEntry.summary).toContain('Description changed');

    // Log entry for debugging
    console.log('Multi-field update history entry:', lastEntry);
  });
  // 16. Verify DB state directly
  it('Direct DB check for task_history', (done) => {
    db.all(`SELECT * FROM task_history WHERE task_id = ? ORDER BY id`, [testTaskId], (err, rows) => {
      expect(err).toBeNull();
      console.log('All history rows for task:', rows); // <-- see exactly what was inserted
      expect(rows.length).toBeGreaterThanOrEqual(3);
      done();
    });
  }); 
  // CLEANUP: Close DB
  afterAll(async () => {
    await new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
});
