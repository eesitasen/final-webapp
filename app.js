require('dotenv').config();
const jwt = require('jsonwebtoken');
const express = require("express");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch({ region: 'us-west-2' });
const StatsD = require('hot-shots');
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const sgMail = require('@sendgrid/mail');

const app = express();
const port = 8080;
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const snsClient = new SNSClient({ region: "us-west-2" }); // Replace with your AWS region
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN; // Replace with your SNS topic ARN
const secretKey = process.env.secret_key; // Store this in an env variable

// 

// // Sequelize setup for MySQL
const { Sequelize, DataTypes } = require("sequelize");
// const sequelize = new Sequelize("db", "root", "Northeastern@06092023", {
//   host: "localhost",
//   dialect: "mysql",
// });

// Use environment variables
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST, // RDS instance endpoint from environment variable
    dialect: "mysql",
  },
);

// Add hooks to track query durations
sequelize.addHook('beforeQuery', (options) => {
  options.queryStart = Date.now(); // Mark the start time before the query executes
});

sequelize.addHook('afterQuery', (options) => {
  const duration = Date.now() - options.queryStart; // Calculate query duration
  statsd.timing('database.query.duration', duration); // Report the duration to StatsD
});

// S3 Setup
const s3 = new AWS.S3({
  region: 'us-west-2',
});
const bucketName =process.env.S3_BUCKET_NAME ; // replace with your S3 bucket name

const statsd = new StatsD({
    host: 'localhost', // Replace with your StatsD server address
    port: 8125,        // Default StatsD port
    prefix: 'webapp.', // Prefix for metrics
});


// User model
const User = sequelize.define("User", {
  // Model attributes are defined here
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    unique: true,
    allowNull: false,
  },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  first_name: DataTypes.STRING,
  last_name: DataTypes.STRING,
  account_created: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  account_updated: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  verification_token: {
    type: DataTypes.STRING, // You can store the token as a string
    allowNull: true, // Token will only be generated when necessary
  },
  verification_expiry: {
    type: DataTypes.DATE, // Store the expiry as a timestamp
    allowNull: true, // Expiry will be set when token is generated
  },
  verification_status: {
    type: DataTypes.STRING, // You can store the token as a string
    allowNull: true, // Token will only be generated when necessary
  },
});

User.prototype.toJSON = function () {
  const userObj = this.get();
  delete userObj.password;

  delete userObj.createdAt;
  delete userObj.updatedAt;
  return userObj;
};

//Image model
const Image = sequelize.define("Image", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  file_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  upload_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
  }
}, {
  timestamps: false,
  tableName: "Images",
});

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Middleware to parse JSON
app.use(express.json());

// Middleware to log API usage and response time
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        // Replace '/' with '_' to make the metric name CloudWatch-friendly
        const metricPath = req.path.replace(/\//g, '_');
        statsd.increment(`api.calls.${req.method}.${metricPath}`);
        statsd.timing(`api.duration.${req.method}.${metricPath}`, duration);
    });
    next();
});

// Middleware to authenticate user
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Check if the Authorization header is present
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Decode the Base64 encoded username:password
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString(
      "ascii",
    );
    const [email, password] = credentials.split(":");

    // Check if email and password were decoded correctly
    if (!email || !password) {
      return res
        .status(401)
        .json({ message: "Invalid authentication credentials" });
    }

    // Find the user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).send();
    }

    if (user.verification_status !== "verified") {
      return res.status(403).json({
        message: "User is not verified. Please verify your account to proceed.",
      });
    }

    // Compare provided password with the hashed password stored in the database
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).send();
    }

    // Attach user to the request object and proceed to the next middleware
    req.user = user;
    next();
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// Utility function for file upload to S3
const uploadToS3 = async (file) => {
  const params = {
    Bucket: bucketName,
    Key: `${uuidv4()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
    const start = Date.now();
    try {
        const result = await s3.upload(params).promise();
        const duration = Date.now() - start;
        statsd.timing('s3.upload.duration', duration);
        statsd.increment('s3.upload.calls');
        return result;
    } catch (error) {
        statsd.increment('s3.upload.errors');
        throw error;
    }
};

// Root route
app.get("/", (req, res) => {
  res.send("Hello, World!!");
});

// // Database connection verification route
// app.get("/healthz", async (req, res) => {
//   // try {
//   //   await sequelize.authenticate();
//   //   res.send('Database connection has been established successfully.');
//   // } catch (error) {
//   //   res.status(500).send('Unable to connect to the database: ' + error.message);
//   // }

//   try {
//     // Disallow the HEAD method
//     if (req.method === "HEAD") {
//       return res.status(405).json({ message: "Method Not Allowed" }); // Method Not Allowed
//     }
//     // Disallow any body content (e.g., form data) by checking if Content-Type is present
//     if (req.headers["content-type"]) {
//       return res.status(400).send();
//     }

//     // Check for a payload or any query parameters are included in the request (should not be present)
//     if (
//       Object.keys(req.body).length !== 0 ||
//       Object.keys(req.query).length !== 0
//     ) {
//       return res.status(400).send(); // Bad Request
//     }

//     // Check database connectivity
//     await sequelize.authenticate();
//     res.set({
//       "Cache-Control": "no-cache",
//     });
//     res.status(200).send(); // OK
//   } catch (error) {
//     res.set({
//       "Cache-Control": "no-cache",
//     });
//     return res.status(503).send(); // Service Unavailable
//   }
// });
// utils/validateHealthzRequest.js
const validateHealthzRequest = (req) => {
  // Disallow the HEAD method
  if (req.method === "HEAD") {
    return {
      valid: false,
      statusCode: 405,
      message: "Method Not Allowed",
    };
  }

  // Disallow any body content (e.g., form data) by checking if Content-Type is present
  if (req.headers["content-type"]) {
    return {
      valid: false,
      statusCode: 400,
      message: "Bad Request",
    };
  }

  // Check for a payload or any query parameters (should not be present)
  if (Object.keys(req.body).length !== 0 || Object.keys(req.query).length !== 0) {
    return {
      valid: false,
      statusCode: 400,
      message: "Bad Request",
    };
  }

  // If validation passes, return valid
  return {
    valid: true,
  };
};


// Database connection verification route
app.get("/healthz", async (req, res) => {
  // Call the validation function
  const validationResult = validateHealthzRequest(req);

  // If validation fails, return the appropriate response
  if (!validationResult.valid) {
    return res.status(validationResult.statusCode).json({ message: validationResult.message });
  }

  try {
    // Check database connectivity
    await sequelize.authenticate();
    res.set({
      "Cache-Control": "no-cache",
    });
    res.status(200).send(); // OK
  } catch (error) {
    res.set({
      "Cache-Control": "no-cache",
    });
    return res.status(503).send(); // Service Unavailable
  }
});

// Create user
app.post("/v1/user", async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).send();
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).send();
    }

    //check that user should not exist
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const uuid = uuidv4();

 // Create the JWT token for verification (with 1-hour expiry)
    const token = jwt.sign({ email, first_name }, secretKey, { expiresIn: '1h' });
    // const tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    const tokenExpiry = new Date(Date.now() + 2 * 60 * 1000);


    const user = await User.create({
      id: uuid,
      email,
      password: hashedPassword,
      first_name,
      last_name,
      verification_token: token,  // Store the JWT token
      verification_expiry: tokenExpiry,  // Store the expiry date of the token
      verification_status: 'not_verified',
 });

    const message = {
      Subject: "New User Created",
      Message: JSON.stringify({ email: email, token: token }), // Sending both email and token
      TopicArn: SNS_TOPIC_ARN,
    };

    try {
      await snsClient.send(new PublishCommand(message));
      console.log("Notification sent to SNS topic.");
    } catch (snsError) {
      console.error("Error sending SNS notification:", snsError);
      // Optionally, log the SNS error or alert admins if necessary
    }

    res.status(201).json({ message: "User Created", user: user.toJSON() });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/verify", async (req, res) => {
  try {
    const { token, userEmail } = req.query;

    // Verify the token and email are provided
    if (!token || !userEmail) {
      return res.status(400).json({ message: "Missing token or email" });
    }

    // Step 1: Query the database to get the token_expiry and stored token for the given email
    const user = await User.findOne({ where: { email: userEmail } });

    if (!user) {
      console.log(`User not found for email: ${userEmail}`);
      return res.status(400).json({ message: "User not found" });
    }

    console.log(`User found for email: ${userEmail}`);
    console.log(`Stored token: ${user.verification_token}`);
    console.log(`Provided token: ${token}`);

    // Step 2: Fetch the stored token from the database and compare it with the provided token
    if (user.verification_token !== token) {
      console.log(`Token mismatch: stored token is different from provided token.`);
      return res.status(400).json({ message: "Invalid token" });
    }

    // Step 3: Compare the stored token_expiry with the current time
    const currentTime = new Date();
    const tokenExpiry = new Date(user.verification_expiry); // assuming token_expiry is stored as a date/timestamp

    console.log(`Token expiry: ${tokenExpiry}`);
    console.log(`Current time: ${currentTime}`);

    if (currentTime > tokenExpiry) {
      console.log(`Token has expired. Current time is later than expiry.`);
      return res.status(400).json({ message: "Token has expired" });
    }

    // Step 4: Verify the token's signature using JWT library
    console.log(`Verifying token...`);
    try {
      jwt.verify(token, secretKey);
      console.log(`Token verified successfully.`);
    } catch (err) {
      console.error(`JWT verification failed: ${err.message}`);
      return res.status(400).json({ message: "Invalid token" });
    }

    // Step 5: Check if the token's email matches the provided email
    if (user.email !== userEmail) {
      console.log(`Email mismatch: provided email (${userEmail}) does not match stored email (${user.email})`);
      return res.status(400).json({ message: "Invalid token or email mismatch" });
    }

    // If all checks pass
    user.verification_status = 'verified';
    await user.save(); // Save the updated user to the database
    res.status(200).json({ message: "User verified successfully!" });
  } catch (error) {
    console.error("Error in verification process:", error);
    res.status(500).json({ message: "Failed to verify user", error: error.message });
  }
});


// Get user (protected route)
app.get("/v1/user/self", authenticateUser, async (req, res) => {
  // Disallow the HEAD method
  if (req.method === "HEAD") {
    return res.status(405).json({ message: "Method Not Allowed" }); // Method Not Allowed
  }

  const user = req.user; // This comes from the authenticateUser middleware

  res.status(200).json({
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    account_created: user.account_created,
    account_updated: user.account_updated,
  });
});

// update user information (protected route)
app.put("/v1/user/self", authenticateUser, async (req, res) => {
    try {  
        const { first_name, last_name, password, ...otherFields } = req.body;
        const user = req.user; // This comes from the authenticateUser middleware

        // Check if the request body is empty
        if (Object.keys(req.body).length === 0) {
            return res.status(204).send(); // No content to update
        }

        // Check if any unsupported fields are being updated
        if (Object.keys(otherFields).length > 0) {
            return res.status(400).send();
        }

        if (password) user.password = await bcrypt.hash(password, 10);
        if (first_name) user.first_name = first_name;
        if (last_name) user.last_ame = last_name;
  
        user.account_updated = new Date();
        await user.save();
  
        res.status(200).json({ message: 'User updated successfully' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal Server Error' });
        }    
});

// Add or Update Profile Pic
app.post('/v1/user/self/pic', authenticateUser, multer().single('pic'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  // Delete existing image if present
  const existingImage = await Image.findOne({ user_id: req.user.id });
  if (existingImage) {
    return res.status(400).send();
  }

  // Upload new image
  const uploadResult = await uploadToS3(req.file);
  const newImage = await Image.create({
    file_name: uploadResult.Key,
    id: uuidv4(),
    url: uploadResult.Location,
    upload_date: new Date(),
    user_id: req.user.id,
  });

  res.json(newImage);
});

// Get Profile Pic
app.get('/v1/user/self/pic', authenticateUser, async (req, res) => {
  const image = await Image.findOne({ user_id: req.user.id });
  if (!image) return res.status(404).send('No profile picture found');
  res.json(image);
});

// Delete Profile Pic
app.delete('/v1/user/self/pic', authenticateUser, async (req, res) => {
  try {
    // Find the user's profile picture in the database
    const image = await Image.findOne({ user_id: req.user.id });
    if (!image) {
      return res.status(404).send('No profile picture found');
    }

    // Delete the image from S3
    await (async () => {
    const params = { Bucket: bucketName, Key: image.file_name };
    const start = Date.now();
    try {
        await s3.deleteObject(params).promise();
        const duration = Date.now() - start;
        statsd.timing('s3.delete.duration', duration);
        statsd.increment('s3.delete.calls');
    } catch (error) {
        statsd.increment('s3.delete.errors');
        throw error;
        }
    })();

    // Delete the image document from the database
    await image.destroy();
    // Respond with 204 No Content to indicate success
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting profile picture' });
  }
});


module.exports = { app, User, sequelize, validateHealthzRequest};
