/**
 * Standard Date Formatter for UI and API responses
 * Ensures consistent "DD MMM YYYY, HH:MM" format across the app.
 */
const formatDisplayDate = (isoString) => {
  if (!isoString) return "Not set";
  
  return new Date(isoString).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

/**
 * Formats history entries with an explicit UTC marker
 */
const formatHistoryDate = (isoString) => {
  return `${formatDisplayDate(isoString)} UTC`;
};

module.exports = { formatDisplayDate, formatHistoryDate };