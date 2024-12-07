const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => new Date().toISOString(),
    }),
    winston.format.printf(({ message }) => {
      return `${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "combined.log",
    }),
    new winston.transports.File({
      filename: "debug.log",
      level: "debug",
    }),
  ],
});

const logData = (
  method,
  originalUrl,
  userAgent,
  type,
  body,
  statusCode,
  message,
  data
) => {
  const logEntry = {
    request: {
      body: body,
    },
    response: {
      status: statusCode,
      message: message,
    },
  };

  if (data !== null && data !== undefined) {
    logEntry.response.data = data;
  }

  const logEntryFormatted = `[${type}] : [url: ${method} ${originalUrl} ${userAgent}] \n status: ${statusCode} \n message: ${message}`;

  if (type === "info") {
    logger.info(`${logEntryFormatted}`);
  } else if (type === "error") {
    logger.error(`${logEntryFormatted}`);
  }
};

module.exports = { logger, logData };
