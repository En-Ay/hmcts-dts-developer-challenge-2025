const AUDIT_CONFIG = {
  title: { label: "Title" },
  description: { label: "Description" },
  status: { 
    label: "Status",
    format: (val) => val
      ? val.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
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

/**
 * Compares two objects and returns a list of human-readable changes
 */
const generateChangeLog = (original, incoming) => {
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
};

module.exports = { generateChangeLog };