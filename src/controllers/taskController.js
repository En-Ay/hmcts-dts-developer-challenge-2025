const TaskModel = require('../models/taskModel');
const { z } = require('zod');

// 1. Define Validation Schema
const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('PENDING'),
  
  // Validation: Must be a valid string (Required now)
  due_date: z.string().min(1, "Due date is required").refine((dateString) => {
    return new Date(dateString) > new Date();
  }, {
    message: "Due date must be in the future"
  }),
});

const TaskController = {
  // GET /tasks
  getAllTasks: async (req, res) => {
    try {
      const tasks = await TaskModel.findAll();
      res.status(200).json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // GET /tasks/:id
  getTaskById: async (req, res) => {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) {
        // HTTP Purity: Return 404 if not found
        return res.status(404).json({ error: "Task not found" });
      }
      res.status(200).json(task);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // POST /tasks
  createTask: async (req, res) => {
    try {
      // Validate input using Zod
      const validatedData = taskSchema.parse(req.body);
      
      const newTask = await TaskModel.create(validatedData);
      
      // HTTP Purity: Return 201 for Created resources
      res.status(201).json(newTask);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // HTTP Purity: Return 400 for Bad Request (Validation failed)
        return res.status(400).json({ errors: error.errors });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // PUT/PATCH /tasks/:id
  updateTask: async (req, res) => {
    try {
      const validatedData = taskSchema.partial().parse(req.body);
      const id = req.params.id;
      
      const existingTask = await TaskModel.findById(id);
      if (!existingTask) return res.status(404).json({ error: "Task not found" });

      // 1. Calculate Changes (The Audit Logic)
      let changes = [];
      if (validatedData.status && validatedData.status !== existingTask.status) {
        changes.push(`Status changed from '${existingTask.status}' to '${validatedData.status}'`);
      }
      if (validatedData.title && validatedData.title !== existingTask.title) {
        changes.push(`Title updated`);
      }
      if (validatedData.description && validatedData.description !== existingTask.description) {
        changes.push(`Description updated`);
      }

      // 2. Update the Task
      const updatedTaskData = { 
        ...existingTask, 
        ...validatedData,
        updated_at: new Date().toISOString() // Track last edit time
      };
      
      await TaskModel.update(id, updatedTaskData);

      // 3. Save History (If anything actually changed)
      if (changes.length > 0) {
        const summary = changes.join(', '); // e.g. "Status changed..., Title updated"
        await TaskModel.addHistory(id, summary);
      }
      
      res.status(200).json(updatedTaskData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      res.status(500).json({ error: "Internal Server Error" });
    }
  },
  // DELETE /tasks/:id
  deleteTask: async (req, res) => {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      await TaskModel.delete(req.params.id);
      // HTTP Purity: 204 No Content is standard for successful deletion
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
};

module.exports = TaskController;