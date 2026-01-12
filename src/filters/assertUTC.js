/**
 * Throws an error if the input string is not a UTC ISO string ending with 'Z'
 * @param {string} isoString
 */
function assertUTC(isoString) {
  if (typeof isoString !== 'string' || !isoString.endsWith('Z')) {
    throw new Error(`Invalid date: expected UTC ISO string ending with 'Z', got '${isoString}'`);
  }
}

module.exports = assertUTC;
