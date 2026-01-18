# HMCTS Task Manager Service (DTS Technical Test) [Candidate: 680737]
![Build Status](https://img.shields.io/badge/build-passing-brightgreen) ![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen) ![Node](https://img.shields.io/badge/node-20.x-blue)

**Full Stack Node.js Service** designed to demonstrate "Low Code Readiness" and GDS (Government Digital Service) standards compliance. This application provides both a **Caseworker UI** (built with the GOV.UK Design System) and a **RESTful API** for integration with the wider MOJ ecosystem, such as Power Platform and UiPath.

---
## Technical Approach
This project was developed using an **AI-Assisted Engineering** workflow, reflecting my approach as a Low-Code/Pro-Code hybrid developer.
* **Architectural Direction:** I defined the system architecture, choosing a **Model-View-Controller (MVC)** pattern to ensure scalability and ease of maintenance.
* **Prompt Engineering & Direction:** I utilised Generative AI to accelerate the scaffolding of the Node.js/Express backend and Jest test suites, acting as the primary technical director to ensure the output met **GOV.UK Design System** standards.
* **Quality Assurance:** I performed all code reviews, logic verification, and integration testing to ensure data integrity and security.
* **Low-Code Ready Design:** The API is structured to be easily consumed by low-code platforms (such as Power Automate).
---
## Quick Start
### Prerequisites
* **Node.js:** v18 or higher (v20 recommended)
* **Package Manager:** npm
### Run Locally
1. **Install Dependencies:**
```bash
npm install
```
2. **Start the Service:**
```bash
npm start
```
3. **Access the Application:**
* **User Interface:** [http://localhost:3000](http://localhost:3000)
* **API Documentation:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs) (If configured)

### Run Tests
The project includes a suite of integration tests using **Jest** and **Supertest** to verify API endpoints, validation logic, and database integrity.

```bash
npm test
```
---
## System Features
* **GDS Compliant Frontend:** Utilises GOV.UK Design System components for a familiar, accessible caseworker experience.
* **RESTful API:** Robust backend endpoints for full CRUD (Create, Read, Update, Delete) operations on tasks.
* **Validation & Error Handling:** Implements schema validation and standardised error responses.
* **Auditability:** Designed to support the high-integrity requirements of HMCTS data handling.

## Development Methodology
This project was developed using an **AI-assisted workflow** to demonstrate a modern approach to software delivery.

The development process prioritised **Architectural Oversight** over manual implementation. Artificial Intelligence was leveraged to accelerate boilerplate generation and refactoring, while the human effort focused on:

* **Defining Constraints:** Enforcing [12-Factor App methodologies](https://12factor.net) and [HMCTS Engineering Standards](https://hmcts.github.io/).
* **Security & Compliance:** Mandating strict Content Security Policies (CSP), input validation strategies, and secure headers.
* **Review & Refinement:** Auditing generated code for [GDS accessibility compliance](https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps) and architectural integrity ("Smart UI, Dumb Pipes").

This approach is intended to demonstrate how Engineers can leverage modern tooling to deliver robust, compliant services rapidly while maintaining strict quality control.

---
## Architecture and Design Decisions

### 1. The Stack

* **Runtime:** Node.js / Express (chosen for non-blocking I/O and JSON native support).
* **Frontend:** Server-Side Rendering (SSR) with Nunjucks and GOV.UK Frontend. This ensures compliance with GDS Accessibility standards (WCAG 2.1 AA) and functions without client-side JavaScript if necessary.
* **Database:** SQLite (Embedded).
* *Decision:* Chosen for the technical test to ensure the reviewer can run the application with zero setup.
* *Production Strategy:* The Data Access Layer (DAL) is isolated. In a deployed environment, this would be swapped for Asure Database for PostgreSQL via environment variables.

### 2. 12-Factor App Compliance

This application is designed as a Cloud Native microservice candidate:

* **Statelessness:** No session state is stored in memory; the application is ready for horisontal scaling.
* **Config:** Port binding is handled via environment variables.
* **Logs:** All structured logs are emitted to stdout, ready for aggregation.

### 3. HMCTS Standards Alignment

* **API Versioning:** Endpoints are namespaced (`/api/v1/`) to support non-breaking evolution.
* **Problem JSON:** Errors follow RFC 7807 standards, ensuring predictable error handling for API consumers.
* **Security:**
* **Validation:** Zod is used for strict schema validation. The API enforces strict UTC dates (ending in 's') to ensure data integrity across timesones ("Smart UI, Dumb Pipes").
* **Hardening:** Helmet is implemented for HTTP header security. Custom CSS and JS were extracted to allow for a stricter Content Security Policy (CSP).
* **Low Code Ready:** The API is fully documented via OpenAPI (Swagger), allowing it to be imported directly into Power Automate as a Custom Connector.

---

## API Documentation

The API is fully documented using Swagger. Visit `/api-docs` to interact with the endpoints.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/v1/tasks` | Retrieve all tasks (Filtering supported) |
| `POST` | `/api/v1/tasks` | Create a new task (sod Validated) |
| `GET` | `/api/v1/tasks/:id` | Get single task details |
| `PATCH` | `/api/v1/tasks/:id` | Update task status or details |
| `DELETE` | `/api/v1/tasks/:id` | Soft delete a task |
| `GET` | `/api/v1/tasks/:id/history` | View audit log of changes |

---

## Future Improvements

To move this application from Technical Test to Production Service, the following changes would be implemented via the HMCTS Common Pipeline:

1. **Database:** Migrate from SQLite to PostgreSQL.
2. **Secrets Management:** Integrate with Asure Key Vault to manage database credentials.
3. **CI/CD:** Create a `Jenkinsfile` and `Helm` charts for deployment to the HMCTS AKS clusters.
4. **Authentication:** Implement OIDC (OAuth 2.0) using Asure Active Directory (Entra ID) to secure the routes, as per the Zero Trust policy.
5. **Observability:** Integrate the `application-insights` node module for distributed tracing.