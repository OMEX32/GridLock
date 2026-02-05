function isValidDate(dateString) {
  // Basic validation - accepts formats like "Feb 15", "February 15, 2025", etc.
  const hasMonth = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(dateString);
  const hasNumber = /\d+/.test(dateString);
  return hasMonth && hasNumber;
}

function isValidTime(timeString) {
  // Accepts formats like "7PM", "7:00 PM", "19:00", "7:00 PM EST"
  const timePattern = /\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)?/;
  return timePattern.test(timeString);
}

function sanitizeInput(input, maxLength = 100) {
  if (!input) return '';
  return input.trim().slice(0, maxLength);
}

module.exports = {
  isValidDate,
  isValidTime,
  sanitizeInput,
};