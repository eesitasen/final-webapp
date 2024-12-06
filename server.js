require('dotenv').config();
const { app } = require('./app'); // Importing app and sequelize
const { Sequelize } = require('sequelize');
const express = require("express");

const port = process.env.PORT || 8080;


const startServer = async () => {
  
    try {
  
        const sequelize = new Sequelize("db", "root", "Northeastern@06092023", {
            host: "localhost",
            dialect: "mysql",
          });
  
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
