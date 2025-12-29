const express = require('express');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// View Engine (Nunjucks for GOV.UK Design System)
// We look in 'src/views' for our files, and 'node_modules' for the official government components
nunjucks.configure([
  'src/views', 
  'node_modules/govuk-frontend/dist' 
], {
  autoescape: true,
  express: app
});
app.set('view engine', 'html');

// Serve Static files (CSS/JS/Images from the GOV.UK package)
app.use('/assets', express.static(path.join(__dirname, '../node_modules/govuk-frontend/dist/govuk/assets')));
app.use('/govuk', express.static(path.join(__dirname, '../node_modules/govuk-frontend/dist/govuk')));
// Serve our custom static files (CSS/JS)
app.use(express.static(path.join(__dirname, '../public')));

// Swagger Documentation Setup (Crucial for Low Code integration)
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'HMCTS Task API',
      version: '1.0.0',
      description: 'API for managing tasks, designed for Low Code consumption.',
    },
  },
  // This looks for the JSDoc comments we wrote in the routes folder
  apis: ['./src/routes/*.js'], 
};
const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Routes
const taskRoutes = require('./routes/tasks');
app.use('/api/tasks', taskRoutes);

// Home Route (Temporary redirect to API docs until we build the frontend)
// Serve the Frontend Views
app.get('/', (req, res) => {
  res.render('index.html');
});

// Serve the Create Task page (we will build this next)
app.get('/create-task', (req, res) => {
  res.render('create.html');
});
// Serve Edit Page
app.get('/edit-task/:id', (req, res) => {
  // Pass the ID to the template so JS knows which task to fetch
  res.render('edit.html', { taskId: req.params.id });
});
module.exports = app;