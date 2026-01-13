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
    }, { message: "Due date must be a valid ISO string" })
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
    format: (val) => val
      ? val.replace(/_/g, ' ')
           .toLowerCase()
           .replace(/\b\w/g, c => c.toUpperCase())
      : val,
    // Optional: consider all status strings case-insensitively equal
    isEqual: (a, b) => String(a).toUpperCase() === String(b).toUpperCase()
  },
  due_date: { 
    label: "Due date",
    isEqual: (a, b) => {
      if (!a && !b) return true;
      if (!a || !b) return false;
      return new Date(a).getTime() === new Date(b).getTime();
    },
    format: (val) => {
      if (!val) return '';
      const d = new Date(val);
      return d.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        hour12: false
      });
    }
  }
};

// --- HELPER FUNCTIONS ---

// Helper function to detect changes
function generateChangeLog(original, incoming) {
  const changes = [];

  Object.keys(AUDIT_CONFIG).forEach(key => {
    if (!(key in incoming)) return; // skip fields not being updated

    const config = AUDIT_CONFIG[key];
    const oldVal = original[key];
    const newVal = incoming[key];

    const isSame = config.isEqual ? config.isEqual(oldVal, newVal) : oldVal === newVal;

    if (!isSame) {
      const fromText = config.format ? config.format(oldVal) : (oldVal ?? '');
      const toText = config.format ? config.format(newVal) : (newVal ?? '');
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
        const fieldErrors = validation.error.flatten().fieldErrors;
        return res.render('create.html', {
          errors: fieldErrors,
          task: req.body,
          errorList: Object.values(fieldErrors).flat().map(msg => ({ text: msg, href: "#" }))
        });
      }

      const data = validation.data;

      // Validate future due date
      const dueDate = new Date(data.due_date);
      if (dueDate < new Date()) {
        return res.render('create.html', {
          task: req.body,
          errors: { due_date: ["Due date must be in the future"] },
          errorList: [{ text: "Due date must be in the future", href: "#due_date" }]
        });
      }

      // Set timestamps for creation
      const taskToCreate = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Create task and insert SINGLE "Task created" history row
      const newTask = await TaskModel.create(taskToCreate);

      // Redirect or render success page
      res.redirect('/');

    } catch (error) {
      console.error("Create Task Error:", error);
      res.status(500).render('error.html', { message: "Server Error" });
    }
  },


  getEditPage: async (req, res) => {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return res.status(404).render('error.html', { message: "Task not found" });

      // Fetch history and map field names for the template
      const historyRaw = await TaskModel.getHistory(req.params.id);
      const history = historyRaw.map(h => ({
        summary: h.change_summary,
        changed_at: new Date(h.changed_at).toLocaleString('en-GB', {
          timeZone: 'UTC',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }) + ' UTC'
      }));

      res.render('edit.html', { task, errors: {}, history });
    } catch (error) {
    console.log("Task:", task);
    console.log("History:", history);
    res.render('edit.html', { task, errors: {}, history });
    }
  },


  // POST: Handle the Edit Form Submission
  postEditTask: async (req, res) => {
    try {
      const taskId = parseInt(req.params.id, 10);

      // 1. Validate input
      const validation = taskSchema.safeParse(req.body);
      if (!validation.success) {
        const fieldErrors = validation.error.flatten().fieldErrors;
        return res.render('edit.html', {
          task: { ...req.body, id: taskId, due_date_input: req.body.due_date },
          errors: fieldErrors,
          errorList: Object.values(fieldErrors).flat().map(msg => ({ text: msg, href: "#" }))
        });
      }

      const newData = validation.data;

      // 2. Fetch existing task
      const existingTask = await TaskModel.findById(taskId);
      if (!existingTask) return res.status(404).render('error.html', { message: "Task not found." });

      // 3. Validate future due date
      if (newData.due_date && newData.due_date !== existingTask.due_date) {
        const due = new Date(newData.due_date);
        if (due < new Date()) {
          return res.render('edit.html', {
            task: { ...req.body, id: taskId, due_date_input: req.body.due_date },
            errors: { due_date: ["Due date must be in the future"] },
            errorList: [{ text: "Due date must be in the future", href: "#due_date" }]
          });
        }
      }

      // 4. Generate change summary
      const changes = generateChangeLog(existingTask, newData);
      const changeSummary = changes.length ? changes.join('\n') : null;

      // 5. Update task in a single call
      await TaskModel.update(
        taskId,
        { ...existingTask, ...newData, updated_at: new Date().toISOString() },
        changeSummary
      );

      // 6. Redirect after successful update
      res.redirect('/');

    } catch (error) {
      console.error("Edit Task Error:", error);
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
    try {
      // 1. Validate input with Zod (includes UTC ISO check)
      const validatedData = taskSchema.parse(req.body);

      // 2. Ensure due_date is in the future
      if (validatedData.due_date) {
        const dueDate = new Date(validatedData.due_date);
        if (dueDate < new Date()) {
          return res.status(400).json({
            errors: [{
              message: "Due date must be in the future",
              path: ["due_date"]
            }]
          });
        }
      }

      // 3. Set timestamps
      const now = new Date().toISOString();
      const taskData = {
        ...validatedData,
        created_at: now,
        updated_at: now
      };

      // 4. Create task
      const newTask = await TaskModel.create(taskData);

      // 5. Respond
      res.status(201).json(newTask);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Create Task Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  updateTask: async (req, res) => {
    try {
      // 1. Validate input (partial updates allowed)
      const validatedData = taskSchema.partial().parse(req.body);

      // 2. Get the task ID and existing task
      const id = parseInt(req.params.id, 10);
      const existingTask = await TaskModel.findById(id);
      if (!existingTask) return res.status(404).json({ error: "Task not found" });

      // 3. Validate future due_date if provided
      if (validatedData.due_date && validatedData.due_date !== existingTask.due_date) {
        const due = new Date(validatedData.due_date);
        if (due < new Date()) {
          return res.status(400).json({
            errors: [{ message: "Due date must be in the future", path: ["due_date"] }]
          });
        }
      }

      // 4. Generate change summary for audit
      const changes = generateChangeLog(existingTask, validatedData);
      const changeSummary = changes.length ? changes.join('\n') : null;

      // 5. Update the task and record history in a single call
      const updatedTask = await TaskModel.update(
        id,
        { ...existingTask, ...validatedData, updated_at: new Date().toISOString() },
        changeSummary
      );

      // 6. Fetch task history
      const historyRaw = await TaskModel.getHistory(id);
      const history = historyRaw.map(entry => ({
        summary: entry.change_summary,
        changed_at: new Date(entry.changed_at).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false
        })
      }));

      // 7. Respond with updated task + history
      res.status(200).json({ ...updatedTask, history });

    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
      console.error("Update Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },


  deleteTask: async (req, res) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      const existingTask = await TaskModel.findById(taskId);

      if (!existingTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Perform soft delete + log audit atomically
      await TaskModel.delete(taskId);

      // Respond with 204 No Content
      res.status(204).send();
    } catch (error) {
      console.error("Delete Task Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  getTaskHistory: async (req, res) => {
    try {
      const taskId = parseInt(req.params.id, 10); // Ensure integer
      const history = await TaskModel.getHistory(taskId);

      // Format timestamps for display
      const formattedHistory = history.map(entry => ({
        summary: entry.change_summary,
        changed_at: new Date(entry.changed_at).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
      }));

      res.status(200).json(formattedHistory);

    } catch (error) {
      console.error("Error fetching task history:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
};

module.exports = TaskController;