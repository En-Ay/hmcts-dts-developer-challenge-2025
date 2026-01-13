const TaskModel = require('../models/taskModel');
const assertUTC = require('../filters/assertUTC');
const { sendApiError } = require('../utils/apiHelper'); // Ensure this import is present
const { z } = require('zod');

// REGEX Patterns:
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
const AUDIT_CONFIG = {
  title: { label: "Title" },
  description: { label: "Description" },
  status: { 
    label: "Status",
    format: (val) => val
      ? val.replace(/_/g, ' ')
           .toLowerCase()
           .replace(/\b\w/g, c => c.toUpperCase())
      : val,
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
function generateChangeLog(original, incoming) {
  const changes = [];
  Object.keys(AUDIT_CONFIG).forEach(key => {
    if (!(key in incoming)) return; 
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
  
  // --- SSR ROUTES (Returning HTML) ---
  // These use res.render(), so we DO NOT use sendApiError here.

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
      const dueDate = new Date(data.due_date);
      if (dueDate < new Date()) {
        return res.render('create.html', {
          task: req.body,
          errors: { due_date: ["Due date must be in the future"] },
          errorList: [{ text: "Due date must be in the future", href: "#due_date" }]
        });
      }

      const taskToCreate = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const newTask = await TaskModel.create(taskToCreate);
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

      const historyRaw = await TaskModel.getHistory(req.params.id);
      const history = historyRaw.map(h => ({
        summary: h.change_summary,
        changed_at: new Date(h.changed_at).toLocaleString('en-GB', {
          timeZone: 'UTC',
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false
        }) + ' UTC'
      }));

      res.render('edit.html', { task, errors: {}, history });
    } catch (error) {
      console.error("Edit Page Error:", error);
      res.render('edit.html', { task: {}, errors: {}, history: [] });
    }
  },

  postEditTask: async (req, res) => {
    try {
      const taskId = parseInt(req.params.id, 10);
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
      const existingTask = await TaskModel.findById(taskId);
      if (!existingTask) return res.status(404).render('error.html', { message: "Task not found." });

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

      const changes = generateChangeLog(existingTask, newData);
      const changeSummary = changes.length ? changes.join('\n') : null;

      await TaskModel.update(
        taskId,
        { ...existingTask, ...newData, updated_at: new Date().toISOString() },
        changeSummary
      );

      res.redirect('/');

    } catch (error) {
      console.error("Edit Task Error:", error);
      res.status(500).render('error.html', { message: "Could not update task." });
    }
  },

  getDeleteConfirmPage: async (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    const task = await TaskModel.findById(taskId);
    if (!task) return res.status(404).send("Task not found");

    const formatDate = (d) => d ? new Date(d).toLocaleString("en-GB", { 
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
      }) : "Not set";

    task.created_at_formatted = formatDate(task.created_at);
    task.due_date_formatted = formatDate(task.due_date);

    res.render("delete-confirm.html", { task });
  },

  postDeleteTask: async (req, res) => {
    try {
      await TaskModel.delete(req.params.id);
      res.redirect('/');
    } catch (error) {
      res.status(500).render('error.html', { message: "Could not delete task" });
    }
  },

  getHomePage: async (req, res) => {
    try {
      let statuses = req.query.status;
      if (!statuses) {
          statuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED']; 
      } else if (typeof statuses === 'string') {
          statuses = [statuses];
      }
      const sort = req.query.sort || 'due_date';
      const order = req.query.order || 'ASC';

      const tasks = await TaskModel.findAll({ 
        statusFilters: statuses, 
        sortBy: sort, 
        sortOrder: order 
      });

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

  // --- API ROUTES (JSON) ---

  getAllTasks: async (req, res) => {
    try {
      const tasks = await TaskModel.findAll();
      res.status(200).json(tasks);
    } catch (error) {
      // FIX: Standardized 500
      sendApiError(res, 500, "An unexpected error occurred while retrieving tasks.");
    }
  },

  getTaskById: async (req, res) => {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) {
        // FIX: Standardized 404
        return sendApiError(res, 404, `Task with ID ${req.params.id} could not be found.`);
      }
      res.status(200).json(task);
    } catch (error) {
      // FIX: Standardized 500
      sendApiError(res, 500, "An unexpected error occurred while retrieving the task.");
    }
  },

  createTask: async (req, res) => {
    try {
      const validatedData = taskSchema.parse(req.body);

      if (validatedData.due_date) {
        const dueDate = new Date(validatedData.due_date);
        if (dueDate < new Date()) {
          // Keeping standard Zod structure for field validation consistency
          return res.status(400).json({
            errors: [{
              message: "Due date must be in the future",
              path: ["due_date"]
            }]
          });
        }
      }

      const now = new Date().toISOString();
      const taskData = {
        ...validatedData,
        created_at: now,
        updated_at: now
      };

      const newTask = await TaskModel.create(taskData);
      res.status(201).json(newTask);

    } catch (error) {
      if (error instanceof z.ZodError) {
        // Keeping Zod structure for frontend compatibility
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Create Task Error:", error);
      // FIX: Standardized 500
      sendApiError(res, 500, "An unexpected error occurred while creating the task.");
    }
  },

  updateTask: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existingTask = await TaskModel.findById(id);

      if (!existingTask) {
        // FIX: Standardized 404
        return sendApiError(res, 404, `Task with ID ${id} could not be found.`);
      }

      const validatedData = taskSchema.partial().parse(req.body);
      const { created_at, updated_at, deleted_at, ...allowedData } = validatedData;

      if (allowedData.due_date && allowedData.due_date !== existingTask.due_date) {
        const due = new Date(allowedData.due_date);
        if (due < new Date()) {
          // Keeping standard Zod structure for field validation consistency
          return res.status(400).json({
            errors: [{
              message: "Due date must be in the future",
              path: ["due_date"]
            }]
          });
        }
      }

      const changes = generateChangeLog(existingTask, allowedData);
      const changeSummary = changes.length ? changes.join("\n") : null;

      const updatedTask = await TaskModel.update(
        id,
        { ...existingTask, ...allowedData, updated_at: new Date().toISOString() },
        changeSummary
      );

      const history = await TaskModel.getHistory(id);
      res.status(200).json({ ...updatedTask, history });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Update Task Error:", error);
      // FIX: Standardized 500
      sendApiError(res, 500, "An unexpected error occurred while updating the task.");
    }
  },

  deleteTask: async (req, res) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      const existingTask = await TaskModel.findById(taskId);

      if (!existingTask) {
        // FIX: Standardized 404
        return sendApiError(res, 404, `Task with ID ${taskId} could not be found.`);
      }

      await TaskModel.delete(taskId);
      res.status(204).send();
    } catch (error) {
      console.error("Delete Task Error:", error);
      // FIX: Standardized 500
      sendApiError(res, 500, "An unexpected error occurred while deleting the task.");
    }
  },

  getTaskHistory: async (req, res) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      const history = await TaskModel.getHistory(taskId);

      const formattedHistory = history.map(entry => ({
        summary: entry.change_summary,
        changed_at: new Date(entry.changed_at).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false
        })
      }));

      res.status(200).json(formattedHistory);

    } catch (error) {
      console.error("Error fetching task history:", error);
      // FIX: Standardized 500
      sendApiError(res, 500, "An unexpected error occurred while retrieving task history.");
    }
  }
};

module.exports = TaskController;