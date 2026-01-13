// src/filters/dateFilter.js
// We export a function that takes an ISO string and returns a formatted date
module.exports = function (isoString) {
  if (!isoString) return "N/A";

  const date = new Date(isoString);

  // Safety check
  if (isNaN(date.getTime())) return isoString;

  // STRICTLY use UTC. 
  // This prevents the server (London/Azure) from shifting the time.
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',       // <--- The Critical Fix
    timeZoneName: 'short'  // <--- Adds "UTC" to the end
  });
};