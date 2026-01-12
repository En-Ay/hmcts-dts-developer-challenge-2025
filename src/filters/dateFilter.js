// src/filters/dateFilter.js
// We export a function that takes an ISO string and returns a formatted date
module.exports = function (isoString) {
  if (!isoString) return "N/A";

  const date = new Date(isoString);

  // Invalid date check
  if (isNaN(date.getTime())) return isoString.replace("T", " ");

  // SIMPLE LOGIC: Use System Time (matches your Browser/Task History)
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};