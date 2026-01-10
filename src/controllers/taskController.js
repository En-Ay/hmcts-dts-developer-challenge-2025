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
      const changes = generateChangeLog(existingTask, validatedData);

      const updatedTaskData = { 
        ...existingTask, 
        ...validatedData,
        updated_at: new Date().toISOString() 
      };
      
      await TaskModel.update(id, updatedTaskData);

      if (changes.length > 0) {
        // OLD: await TaskModel.addHistory(id, changes.join(', '));
        
        // NEW: Join with a newline character
        await TaskModel.addHistory(id, changes.join('\n'));
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

// AUDIT LOGIC ENGINE //
// CONFIGURATION: How each field behaves in the audit log
const AUDIT_CONFIG = {
  title: { label: "Title" }, // Default string comparison
  description: { label: "Description" },
  status: { 
    label: "Status",
    // Transform "IN_PROGRESS" -> "In Progress" for the log
    format: (val) => val.replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) 
  },
  due_date: { 
    label: "Due date",
    // Custom comparator to handle the UTC vs String issues we solved earlier
    isEqual: (a, b) => new Date(a).getTime() === new Date(b).getTime(),
    // Custom formatter for the "Europe/London" requirement
    format: (val) => new Date(val).toLocaleString('en-GB', { 
      timeZone: 'Europe/London',
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit'
    })
  }
};

// THE ENGINE: Generic function to detect changes
function generateChangeLog(original, incoming) {
  const changes = [];

  Object.keys(incoming).forEach(key => {
    const config = AUDIT_CONFIG[key];
    if (!config) return; // Ignore fields we don't track (like internal IDs)

    const oldVal = original[key];
    const newVal = incoming[key];

    // 1. Check for Equality (Use custom logic if provided, else strict ===)
    const isSame = config.isEqual 
      ? config.isEqual(oldVal, newVal) 
      : oldVal === newVal;

    if (!isSame) {
      // 2. Format the output (Use custom formatter if provided)
      const fromText = config.format ? config.format(oldVal) : oldVal;
      const toText = config.format ? config.format(newVal) : newVal;

      changes.push(`${config.label} changed from '${fromText}' to '${toText}'`);
    }
  });

  return changes;
}
module.exports = TaskController;