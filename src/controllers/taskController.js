const TaskModel = require('../models/taskModel');
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
  due_date: z.string().min(1, "Due date is required") 
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
    format: (val) => new Date(val).toLocaleString('en-GB', { 
      day: 'numeric', month: 'short', year: 'numeric', 
      hour: '2-digit', minute: '2-digit'
    })
  }
};

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
    now.setHours(now.getHours() + 1);
    const defaultDate = now.toISOString().slice(0, 16);

    res.render('create.html', { 
      errors: {}, 
      task: { due_date: defaultDate } 
    });
  },

  // POST: Handle the Create Task Form Submission
  postCreateTask: async (req, res) => {
    try {
      // 1. Zod Validation
      const validation = taskSchema.safeParse(req.body);

    if (!validation.success) {
        const fieldErrors = validation.error.flatten().fieldErrors;
        return res.render('create.html', {
          errors: fieldErrors, 
          task: req.body,
          errorList: Object.values(fieldErrors).flat().map(msg => ({ text: msg, href: "#" }))
        });
      }

      // 2. Business Logic: Future Date Check
      const data = validation.data;
      const selectedTs = new Date(data.due_date).getTime();
      const nowTs = new Date().getTime();

      // DEBUGGING: Check your terminal to see these values
      console.log(`[Create Task] Input: ${data.due_date}`);
      console.log(`[Create Task] Selected TS: ${selectedTs}, Now TS: ${nowTs}`);
      console.log(`[Create Task] Is Past? ${selectedTs < nowTs}`);

      // CHECK: If date is Invalid (NaN) OR in the past
      if (isNaN(selectedTs) || selectedTs < nowTs) {
         return res.render('create.html', {
           task: req.body, // Keep the form filled
           errors: { due_date: ["Due date must be in the future"] },
           errorList: [{ text: "Due date must be in the future", href: "#due_date" }]
         });
      }

      // 3. Save & Redirect
      await TaskModel.create(data);
      res.redirect('/'); 

    } catch (error) {
      console.error(error);
      res.status(500).render('error.html', { message: "Server Error" });
    }
  },
  // GET: Render the Edit Page (Pre-filled)
  getEditPage: async (req, res) => {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return res.status(404).render('error.html', { message: "Task not found" });

      // Render the edit view with the existing task data
      res.render('edit.html', { 
        task: task, 
        errors: {} 
      });
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
        const fieldErrors = validation.error.flatten().fieldErrors;
        return res.render('edit.html', {
          task: { ...req.body, id: taskId },
          errors: fieldErrors,
          errorList: Object.values(fieldErrors).flat().map(msg => ({ text: msg, href: "#" }))
        });
      }

      const existingTask = await TaskModel.findById(taskId);
      const newData = validation.data;
      
      const utcInputString = newData.due_date.endsWith('Z') ? newData.due_date : newData.due_date + 'Z';
      const newTs = new Date(utcInputString).getTime();
      const oldTs = new Date(existingTask.due_date).getTime();

      if (newTs !== oldTs) {
         const nowTs = Date.now();
         if (newTs < nowTs) {
             return res.render('edit.html', {
               task: { ...req.body, id: taskId },
               errors: { due_date: ["Due date must be in the future"] },
               errorList: [{ text: "Due date must be in the future", href: "#due_date" }]
             });
         }
      }

      // 1. GENERATE HISTORY (This was missing!)
      const changes = generateChangeLog(existingTask, { 
          ...newData, 
          due_date: new Date(utcInputString).toISOString() 
      });

      // 2. UPDATE TASK
      await TaskModel.update(taskId, { 
        ...existingTask, 
        ...newData, 
        due_date: new Date(utcInputString).toISOString(),
        updated_at: new Date().toISOString() 
      });

      // 3. SAVE HISTORY (This was missing!)
      if (changes.length > 0) {
        await TaskModel.addHistory(taskId, changes.join('\n'));
      }
      
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
          statuses = []; 
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
    try {
      const validatedData = taskSchema.parse(req.body);
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
        const history = await TaskModel.getHistory(taskId);
        res.status(200).json(history);
      } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  };
module.exports = TaskController;