const request = require('supertest');
const app = require('../src/app'); 
const db = require('../src/config/db');

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
    testTaskId = res.body.id; // Save for subsequent tests
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
    expect(res.body.errors[0].message).toEqual("Due date must be in the future");
  });

// 4. SECURITY VALIDATION: Invalid Characters (XSS Prevention)
  it('POST /api/tasks - should block titles with unsafe characters', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Malicious <script>alert(1)</script>', // < and > are not allowed
        due_date: tomorrow.toISOString()
      });

    expect(res.statusCode).toEqual(400);
    // Matches the custom message we set in Zod
    expect(res.body.errors[0].message).toContain("Title contains invalid characters");
  });

  // 5. INCLUSION VALIDATION: International Characters
  it('POST /api/tasks - should accept titles with international characters', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: "Case Review: Renée & Noël (Åsa's File)", // Accents & punctuation
        status: 'PENDING',
        due_date: tomorrow.toISOString()
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.title).toEqual("Case Review: Renée & Noël (Åsa's File)");
  });

  // 6. HAPPY PATH: Update Status (This Generates History!)
  it('PUT /api/tasks/:id - should update task status', async () => {
    const res = await request(app)
      .put(`/api/tasks/${testTaskId}`)
      .send({
        status: 'IN_PROGRESS'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('IN_PROGRESS');
  });

  // 7. VALIDATION: Update to Past Date
  it('PUT /api/tasks/:id - should block updates to past dates', async () => {
    const res = await request(app)
      .put(`/api/tasks/${testTaskId}`)
      .send({
        due_date: '1995-05-05'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.errors[0].message).toEqual("Due date must be in the future");
  });

  // 8. VALIDATION: Update removing Title
  it('PUT /api/tasks/:id - should block removing the title', async () => {
    const res = await request(app)
      .put(`/api/tasks/${testTaskId}`)
      .send({
        title: '' 
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.errors[0].path[0]).toEqual('title');
  });

  // 9. AUDIT TRAIL: Get History
  it('GET /api/tasks/:id/history - should retrieve audit logs', async () => {
    // We updated the task in Test #6, so a history row MUST exist now.
    const res = await request(app).get(`/api/tasks/${testTaskId}/history`);
    
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body.length).toBeGreaterThan(0);
    
    // Verify the log content matches what we did in Test #6
    const entry = res.body[0]; 
    expect(entry).toHaveProperty('change_summary');
    expect(entry.change_summary).toContain("Status changed");
    expect(entry.task_id).toEqual(testTaskId);
  });

  // 10. DATA INTEGRITY: Soft Delete API Check
  it('DELETE /api/tasks/:id - should soft delete the task', async () => {
    // A. Perform Delete
    const delRes = await request(app).delete(`/api/tasks/${testTaskId}`);
    expect(delRes.statusCode).toEqual(204); 

    // B. Verify it is gone from the Public API
    const getRes = await request(app).get(`/api/tasks/${testTaskId}`);
    expect(getRes.statusCode).toEqual(404); 
  });

  // 11. DATA INTEGRITY: Soft Delete Database Check
  it('Internal DB Check - deleted task should still exist in DB (Soft Delete)', (done) => {
     db.get(`SELECT * FROM tasks WHERE id = ?`, [testTaskId], (err, row) => {
       expect(err).toBeNull();
       expect(row).toBeDefined();
       expect(row.title).toEqual('Integration Test Task');
       expect(row.deleted_at).not.toBeNull(); 
       done();
     });
  });

  // CLEANUP
  afterAll((done) => {
    db.close((err) => {
      if (err) console.error(err);
      done();
    });
  });
});