const TaskModel = require('../models/taskModel');
const { z } = require('zod');

// 1. RELAXED Schema (Types Only)
// We removed the .refine() rule here because it's too broad
const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('PENDING'),
  due_date: z.string().min(1, "Due date is required") 
});

const TaskController = {
  getAllTasks: async (req, res) => {
    try {
      const tasks = await TaskModel.findAll();
      res.status(200).json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  getTaskById: async (req, res) => {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.status(200).json(task);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  createTask: async (req, res) => {
    try {
      const validatedData = taskSchema.parse(req.body);

      // LOGIC: New tasks MUST be in the future
      if (new Date(validatedData.due_date) < new Date()) {
        return res.status(400).json({ 
          errors: [{ message: "Due date must be in the future", path: ["due_date"] }] 
        });
      }

      const newTask = await TaskModel.create(validatedData);
      res.status(201).json(newTask);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  updateTask: async (req, res) => {
    try {
      const validatedData = taskSchema.partial().parse(req.body);
      const id = req.params.id;
      
      const existingTask = await TaskModel.findById(id);
      if (!existingTask) return res.status(404).json({ error: "Task not found" });

      // LOGIC: Only validate date if it has CHANGED
      if (validatedData.due_date && validatedData.due_date !== existingTask.due_date) {
         if (new Date(validatedData.due_date) < new Date()) {
            return res.status(400).json({ 
              errors: [{ message: "Due date must be in the future", path: ["due_date"] }] 
            });
         }
      }

      // ... Audit Logic (Same as before) ...
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
      if (validatedData.due_date && validatedData.due_date !== existingTask.due_date) {
        changes.push(`Due date rescheduled`);
      }

      const updatedTaskData = { 
        ...existingTask, 
        ...validatedData,
        updated_at: new Date().toISOString() 
      };
      
      await TaskModel.update(id, updatedTaskData);

      if (changes.length > 0) {
        await TaskModel.addHistory(id, changes.join(', '));
      }
      
      res.status(200).json(updatedTaskData);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  deleteTask: async (req, res) => {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });
      await TaskModel.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },
  getTaskHistory: async (req, res) => {
    try {
      const taskId = req.params.id;
      
      // Check if task exists first (optional but good practice)
      const task = await TaskModel.findById(taskId);
      if (!task) return res.status(404).json({ error: "Task not found" });

      const history = await TaskModel.getHistory(taskId);
      res.status(200).json(history);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
};

module.exports = TaskController;