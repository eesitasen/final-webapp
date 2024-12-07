const winston = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

require('dotenv').config();
const { app, sequelize } = require('./app'); // Importing app and sequelize

const port = process.env.PORT || 8080;

const cloudwatchConfig = {
  logGroupName: process.env.CLOUDWATCH_LOG_GROUP_NAME || 'MyAppLogGroup', // Set your log group name
  logStreamName: process.env.CLOUDWATCH_LOG_STREAM_NAME || 'MyAppLogStream', // Set your log stream name
  region: process.env.AWS_REGION || 'us-west-2', // Set your AWS region
};

// Initialize CloudWatch service
const cloudwatch = new AWS.CloudWatchLogs({
  region: cloudwatchConfig.region,
});

// Set up Winston logger with CloudWatch transport
const logger = winston.createLogger({
  level: 'info', // Log level
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(), // Console log transport
    new WinstonCloudWatch({
      cloudWatchLogs: cloudwatch,
      logGroupName: cloudwatchConfig.logGroupName,
      logStreamName: cloudwatchConfig.logStreamName,
      awsRegion: cloudwatchConfig.region,
      jsonMessage: true, // Log in JSON format
      flushInterval: 2000, // Set flush interval (in ms)
    }),
  ],
});

app.use((req, res, next) => {
  logger.info({
    message: 'Incoming request',
    method: req.method,
    url: req.url,
    headers: req.headers,
  });
  next();
}); 


const startServer = async () => {
  
    try {
            sequelize
          .sync({ force: true })
          .then(() => {
            app.listen(port, () => {
              console.log(`App is running on http://localhost:${port}`);
            });
          })
          .catch((error) => {
            console.error('Error syncing with the database:', error);
          });

    } catch (error) {
  
      console.error("Unable to connect the database", error.message);
      const apiError = new Error("Unable to sync the database.");
      apiError.statusCode = 500;
    }
  };
  
  startServer();

//   
