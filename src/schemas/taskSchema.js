const { z } = require('zod');
const assertUTC = require('../filters/assertUTC');

// REGEX Patterns
const TITLE_REGEX = /^[\p{L}\p{N}\s.,:;_\-()'"?!£$%&]+$/u;
const DESC_REGEX = /^[\p{L}\p{N}\s.,:;_\-()'"?!£$%&\n\r]+$/u;

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

module.exports = taskSchema;