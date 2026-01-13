const express = require('express');
const helmet = require('helmet');
const nunjucks = require('nunjucks');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const dateFilter = require('./filters/dateFilter');
const app = express();
const statusFilter = require('./filters/statusFilter');
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
// --- SECURITY MIDDLEWARE ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // We must allow 'unsafe-inline' for scripts because:
      // 1. Swagger UI (/api-docs) requires it.
      // 2. GOV.UK Frontend init script in layout.html is inline.
      scriptSrc: ["'self'", "'unsafe-inline'"],
      
      // We must allow 'unsafe-inline' for styles because:
      // 1. Swagger UI requires it.
      styleSrc: ["'self'", "'unsafe-inline'"],
      
      // Allow images from self and data: (used by Swagger/Maps)
      imgSrc: ["'self'", "data:"],
    },
  },
}));
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
// Initialize swagger-jsdoc
const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// --- ROUTES ---
const taskRoutes = require('./routes/tasks');
const pageRoutes = require('./routes/pages'); 

// Mount the Routes
app.use('/api/v1/tasks', taskRoutes); // API Endpoints (Swagger, Fetch)
app.use('/', pageRoutes);          // HTML Pages (SSR)

// --- ERROR HANDLERS ---

// Global 404 Handler (Must be after all other routes)
app.use((req, res, next) => {
  res.status(404).render('error.html', { 
    message: "Page not found. If you typed the web address, check it is correct." 
  });
});

// Global 500 Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error.html', { 
    message: "Something went wrong. Please try again later." 
  });
});
// --- NUNJUCKS FILTER REGISTRATION ---
const njkEnv = nunjucks.configure([
  'src/views', 
  'node_modules/govuk-frontend/dist' 
], {
  autoescape: true,
  express: app
});
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});
// Register the custom filters
njkEnv.addFilter('date', dateFilter);
njkEnv.addFilter('friendlyStatus', statusFilter);
module.exports = app;