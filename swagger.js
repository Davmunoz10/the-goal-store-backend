const swaggerJSDoc = require("swagger-jsdoc");

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "API The Goal Store",
    version: "1.0.0",
    description: "Documentación de la API REST de The Goal Store",
  },
  servers: [
    {
      url: "http://IP_PUBLICA:3000",
      description: "Servidor AWS",
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: [], 
};

module.exports = swaggerJSDoc(options);
