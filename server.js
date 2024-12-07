require('dotenv').config();
const { app, sequelize } = require('./app'); // Importing app and sequelize

const port = process.env.PORT || 8080;

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
