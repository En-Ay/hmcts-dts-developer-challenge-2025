/**
 * Standardizes API Error Responses (RFC 7807 Problem Details)
 */
const sendApiError = (res, statusCode, detail) => {
  // Map common status codes to official titles
  const statusTitles = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    415: "Unsupported Media Type",
    422: "Unprocessable Entity",
    500: "Internal Server Error"
  };

  const title = statusTitles[statusCode] || "Unknown Error";

  // Return the standardized JSON
  return res.status(statusCode).json({
    type: `https://httpstatuses.com/${statusCode}`,
    title: title,
    status: statusCode,
    detail: detail // Specific message (e.g., "Task ID 123 not found")
  });
};

module.exports = { sendApiError };