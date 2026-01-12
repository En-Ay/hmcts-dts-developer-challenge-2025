const TaskModel = require('../models/taskModel');
const assertUTC = require('../filters/assertUTC');
const { z } = require('zod');
// REGEX Patterns:
// ^ ... $  : Match start to end
// \p{L}    : Any Unicode Letter (includes accents like é, ü, ñ, etc.)
// \p{N}    : Any Unicode Number
// \s       : Whitespace
// ...      : Plus your specific punctuation allowed list
const TITLE_REGEX = /^[\p{L}\p{N}\s.,:;_\-()'"?!£$%&]+$/u;
const DESC_REGEX = /^[\p{L}\p{N}\s.,:;_\-()'"?!£$%&\n\r]+$/u;

// 1. Validation (Types Only)
const taskSchema = z.object({
  title: z.string()
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or less")
    .regex(TITLE_REGEX, "Title contains invalid characters (check for special symbols)"),

  description: z.string()
    .max(2000, "Description must be 2000 characters or less")
    .regex(DESC_REGEX, "Description contains invalid characters")
    .optional()
    .or(z.literal('')),

  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('PENDING'),

  // UTC validation enforced via the helper
  due_date: z.string()
    .min(1, "Due date is required")
    .refine(val => {
      try {
        assertUTC(val);
        return true;
      } catch {
        return false;
      }
    }, { message: "Due date must be a UTC ISO string ending with 'Z'" })
});
// ==========================================
// CONFIG: Audit Logging Logic
// ==========================================
// Defined at the top level so the Controller can see it
const AUDIT_CONFIG = {
  title: { label: "Title" },
  description: { label: "Description" },
  status: { 
    label: "Status",
    // Formatter: "IN_PROGRESS" -> "In Progress"
    format: (val) => val ? val.replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : val
  },
  due_date: { 
    label: "Due date",
    // Compare timestamps to ignore string format differences
    isEqual: (a, b) => new Date(a).getTime() === new Date(b).getTime(),
    // Formatter: "27 Mar 2025, 10:00"
    format: (val) => {
      if (!val) return val;
      const d = new Date(val);

      return d.toLocaleString('en-GB', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }) + ' UTC';
    }
  }
};
// --- HELPER FUNCTIONS ---

// Helper function to detect changes
function generateChangeLog(original, incoming) {
  const changes = [];

  Object.keys(incoming).forEach(key => {
    const config = AUDIT_CONFIG[key];
    if (!config) return; // Skip fields we don't track

    const oldVal = original[key];
    const newVal = incoming[key];

    // 1. Check Equality (Custom logic or strict equality)
    const isSame = config.isEqual 
      ? config.isEqual(oldVal, newVal) 
      : oldVal === newVal;

    if (!isSame) {
      // 2. Format output
      const fromText = config.format ? config.format(oldVal) : oldVal;
      const toText = config.format ? config.format(newVal) : newVal;

      changes.push(`${config.label} changed from '${fromText}' to '${toText}'`);
    }
  });

  return changes;
}
// ==========================================
// CONTROLLER
// ==========================================
const TaskController = {
  getCreatePage: (req, res) => {
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');

  const defaultDate =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    res.render('create.html', { 
      errors: {}, 
      task: { due_date: defaultDate } 
    });
  },

  // POST: Handle the Create Task Form Submission
  postCreateTask: async (req, res) => {
    try {
      const validation = taskSchema.safeParse(req.body);
      if (!validation.success) {
        // ... (Error handling stays the same) ...
        const fieldErrors = validation.error.flatten().fieldErrors;
        return res.render('create.html', {
          errors: fieldErrors, 
          task: req.body,
          errorList: Object.values(fieldErrors).flat().map(msg => ({ text: msg, href: "#" }))
        });
      }

      const data = validation.data;
      // LOGIC: Validate Future Date using the Date Object
      if (new Date(data.due_date) < new Date()) {
         return res.render('create.html', {
           task: req.body,
           errors: { due_date: ["Due date must be in the future"] },
           errorList: [{ text: "Due date must be in the future", href: "#due_date" }]
         });
      }

      await TaskModel.create(data);
      res.redirect('/'); 

    } catch (error) {
      console.error(error);
      res.status(500).render('error.html', { message: "Server Error" });
    }
  },
  getEditPage: async (req, res) => {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return res.status(404).render('error.html', { message: "Task not found" });

      res.render('edit.html', { task, errors: {} });
    } catch (error) {
      console.error(error);
      res.status(500).render('error.html', { message: "Server Error" });
    }
  },

  // POST: Handle the Edit Form Submission
  postEditTask: async (req, res) => {
    try {
      const taskId = req.params.id;
      const validation = taskSchema.safeParse(req.body);

      if (!validation.success) {
         // ... (Error handling) ...
         const fieldErrors = validation.error.flatten().fieldErrors;
         return res.render('edit.html', {
           task: { ...req.body, id: taskId, due_date_input: req.body.due_date }, // Keep user's input
           errors: fieldErrors,
           errorList: Object.values(fieldErrors).flat().map(msg => ({ text: msg, href: "#" }))
         });
      }

      const newData = validation.data;
      const existingTask = await TaskModel.findById(taskId);

      // Check future date logic
      if (newData.due_date && newData.due_date !== existingTask.due_date) {
         if (new Date(newData.due_date) < new Date()) {
             return res.render('edit.html', {
               task: { ...req.body, id: taskId, due_date_input: req.body.due_date },
               errors: { due_date: ["Due date must be in the future"] }
             });
         }
      }

      await TaskModel.update(taskId, { ...existingTask, ...newData, updated_at: new Date().toISOString() });
      res.redirect('/');

    } catch (error) {
      console.error(error);
      res.status(500).render('error.html', { message: "Could not update task." });
    }
  },
  // GET: Render Delete Confirmation Page
  getDeleteConfirmPage: async (req, res) => {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return res.status(404).render('error.html', { message: "Task not found" });

      res.render('delete-confirm.html', { task });
    } catch (error) {
      console.error(error);
      res.status(500).render('error.html', { message: "Server Error" });
    }
  },
  // POST: Handle Delete (SSR Style)
  postDeleteTask: async (req, res) => {
    try {
      await TaskModel.delete(req.params.id);
      res.redirect('/');
    } catch (error) {
      res.status(500).render('error.html', { message: "Could not delete task" });
    }
  },
  // GET: Render Home Page with Task List
  getHomePage: async (req, res) => {
    try {
      // 1. Parse Status Filters
      // Express handles ?status=A&status=B as an array ['A', 'B']
      // If one is checked, it's a string 'A'. If none, it's undefined.
      let statuses = req.query.status;
      
      // Normalize to array
      if (!statuses) {
          // Default: If user visits homepage first time, decide what to show.
          // For now, let's show EVERYTHING if nothing selected, or default to PENDING/IN_PROGRESS
          statuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED']; 
      } else if (typeof statuses === 'string') {
          statuses = [statuses];
      }

      // 2. Parse Sort Options
      const sort = req.query.sort || 'due_date';
      const order = req.query.order || 'ASC';

      // 3. Fetch Data
      const tasks = await TaskModel.findAll({ 
        statusFilters: statuses, 
        sortBy: sort, 
        sortOrder: order 
      });

      // 4. Render View
      // We pass the params back to the view so the checkboxes stay checked!
      res.render('index.html', { 
        tasks, 
        selectedStatus: statuses,
        currentSort: sort,
        currentOrder: order
      });

    } catch (error) {
      console.error(error);
      res.status(500).render('error.html', { message: "Server Error" });
    }
  },
  // API: Get All Tasks (JSON)
  getAllTasks: async (req, res) => {
    try {
      // The API can also benefit from the filtering logic if you want!
      // For now, calling it empty returns everything (as per default params in Model)
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
    // API ENDPOINT
    try {
      const validatedData = taskSchema.parse(req.body);
        
      if (new Date(validatedData.due_date) < new Date()) {
        return res.status(400).json({ errors: [{ message: "Due date must be in the future" }] });
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

      if (validatedData.due_date) {

        // Validate future date
        if (new Date(validatedData.due_date) < new Date()) {
          return res.status(400).json({ errors: [{ message: "Future date required" }] });
        }
      }
      
      // ... Audit logic ...
      // For Audit: Be careful comparing UTC to Local strings. Best to stick to DB values.
      
      const updatedTaskData = { ...existingTask, ...validatedData, updated_at: new Date().toISOString() };
      await TaskModel.update(id, updatedTaskData);
      
      // ... Add history ...
      
      res.status(200).json(updatedTaskData);
    } catch (error) {
       // ... error handling
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
        const history = await TaskModel.getHistory(taskId);
        res.status(200).json(history);
      } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  };
module.exports = TaskController;