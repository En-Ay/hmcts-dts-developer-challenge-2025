/**
 * Converts a machine code like "IN_PROGRESS" to "In Progress"
 */
module.exports = function (status) {
  if (!status) return 'Unknown';
  
  // Replace underscores with spaces, lowercase it, then capitalize words
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
};