// Global State
let currentTasks = [];
let sortDirection = {}; 
// SHARED CONSTANTS (Single Source of Truth)
const STATUS_LABELS = {
  'PENDING': 'Pending',
  'IN_PROGRESS': 'In Progress',
  'COMPLETED': 'Completed'
};
// Date Formatting Options
const DATE_OPTIONS = {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false
};
// Regex Patterns for Safe Text Validation
// We use the 'u' flag for Unicode matching
const SAFE_TITLE_REGEX = /^[\p{L}\p{N}\s.,:;_\-()'"?!£$%&]+$/u;
const SAFE_DESC_REGEX = /^[\p{L}\p{N}\s.,:;_\-()'"?!£$%&\n\r]+$/u;
function formatDisplayDate(isoString) {
  if (!isoString) return 'N/A';
  // Check if it's a valid date
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  return date.toLocaleString('en-GB', DATE_OPTIONS);
}
// Function to prepare form data, converting local date to UTC ISO string
function prepareTaskPayload(formData) {
  const data = Object.fromEntries(formData.entries());

  if (data.due_date) {
    // 1. Create a Date object (Browser assumes this is Local Time)
    const localDate = new Date(data.due_date);
    
    // 2. Convert to strict UTC String (e.g., "2025-01-10T13:00:00.000Z")
    data.due_date = localDate.toISOString();
  }
  
  return data;
}
document.addEventListener('DOMContentLoaded', () => {
  // 1. Identify active page elements
  const tableBody = document.getElementById('task-list-body');
  const createForm = document.getElementById('create-task-form');
  const editForm = document.getElementById('edit-task-form');
  const filterSelect = document.getElementById('status-filter');

  // --- A. HOMEPAGE LOGIC ---
  if (tableBody) {
    fetchTasks();
    
    // Attach Filter Listener
    if (filterSelect) {
      filterSelect.addEventListener('change', () => applyFilterAndRender());
    }
  }

  // --- B. CREATE PAGE LOGIC ---
  if (createForm) {
    // This explicitly binds the submit event to our validation function
    createForm.addEventListener('submit', handleCreateTask);
  }

  // --- C. EDIT PAGE LOGIC ---
  if (editForm) {
    const taskId = document.getElementById('task-id').value;
    const deleteBtn = document.getElementById('delete-task-btn');

    // Load existing data
    loadTaskForEdit(taskId);
    
    // Handle Save
    editForm.addEventListener('submit', (e) => handleEditSubmit(e, taskId));

    // Handle Delete
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => handleDeleteClick(taskId));
    }
  }
});
// ==========================================
// 1. FORM VALIDATION LOGIC
// ==========================================

// Regex: Alphanumeric + space + common punctuation (.,:;_-)
// Blocks: @ / ! $ % etc.
const SAFE_TEXT_REGEX = /^[a-zA-Z0-9\s.,:;_\-]+$/;

function validateForm(title, description, dateValue, originalDate = null) {
  let errors = [];

  // 1. Title Validation
  if (!title.trim()) {
    errors.push("Title is required");
  } else if (title.length > 100) {
    errors.push("Title must be 100 characters or less");
  } else if (!SAFE_TITLE_REGEX.test(title)) {
    errors.push("Title contains invalid characters");
  }

  // 2. Description Validation (Optional, Max 2000, Safe Chars + Newlines)
  if (description) {
    if (description.length > 2000) {
      errors.push("Description must be 2000 characters or less");
    } else if (!SAFE_DESC_REGEX.test(description)) {
      errors.push("Description contains invalid characters");
    }
  }

  // 3. Date Validation
  if (!dateValue) {
    errors.push("Enter a due date and time");
  } else if (new Date(dateValue) < new Date() && dateValue !== originalDate) {
    errors.push("Due date must be in the future");
  }

  return errors;
}
// ==========================================
// 2. CREATE TASK (Dual Validation + Business Logic)
// ==========================================
async function handleCreateTask(event) {
  event.preventDefault(); // STOP page reload
  
  // Inputs
  const titleInput = document.getElementById('title');
  const dateInput = document.getElementById('due_date');
  
  // Error Container Elements
  const errorSummary = document.getElementById('error-summary');
  
  // Title Error Elements
  const summaryTitleError = document.getElementById('summary-title-error');
  const titleGroup = document.getElementById('title-group');
  const titleErrorMsg = document.getElementById('title-error');
  
  // Date Error Elements
  const summaryDateError = document.getElementById('summary-date-error');
  const dateGroup = document.getElementById('due-date-group');
  const dateErrorMsg = document.getElementById('due-date-error');
  
  // Specific Link inside the Summary Box for Date
  const summaryDateLink = document.querySelector('#summary-date-error a');

  // --- RESET ALL ERRORS ---
  if(errorSummary) errorSummary.style.display = 'none';
  if(summaryTitleError) summaryTitleError.style.display = 'none';
  if(summaryDateError) summaryDateError.style.display = 'none';

  if(titleGroup) titleGroup.classList.remove('govuk-form-group--error');
  if(titleInput) titleInput.classList.remove('govuk-input--error');
  if(titleErrorMsg) titleErrorMsg.style.display = 'none';

  if(dateGroup) dateGroup.classList.remove('govuk-form-group--error');
  if(dateInput) dateInput.classList.remove('govuk-input--error');
  if(dateErrorMsg) dateErrorMsg.style.display = 'none';

  let hasError = false;

  // --- VALIDATE TITLE ---
  if (!titleInput.value.trim()) {
    if(summaryTitleError) summaryTitleError.style.display = 'block';
    
    if(titleGroup) titleGroup.classList.add('govuk-form-group--error');
    if(titleErrorMsg) titleErrorMsg.style.display = 'block';
    if(titleInput) titleInput.classList.add('govuk-input--error');
    
    hasError = true;
  }

  // --- VALIDATE DATE (Empty AND Past Checks) ---
  const dateValue = dateInput.value;
  let dateErrorMessageText = "Enter a due date and time"; // Default message

  // 1. Check if Empty
  if (!dateValue) {
    hasError = true;
  } 
  // 2. Check if in Past (Business Logic)
  else if (new Date(dateValue) < new Date()) {
    hasError = true;
    dateErrorMessageText = "Due date must be in the future";
  }

  if (hasError && (summaryDateError || dateGroup)) {
    // Update the Text Dynamically
    if (summaryDateLink) summaryDateLink.innerText = dateErrorMessageText;
    if (dateErrorMsg) dateErrorMsg.innerHTML = `<span class="govuk-visually-hidden">Error:</span> ${dateErrorMessageText}`;

    // Show the Errors
    if(summaryDateError) summaryDateError.style.display = 'block';
    if(dateGroup) dateGroup.classList.add('govuk-form-group--error');
    if(dateErrorMsg) dateErrorMsg.style.display = 'block';
    if(dateInput) dateInput.classList.add('govuk-input--error');
  }

  // --- FINAL CHECK ---
  if (hasError) {
    if(errorSummary) errorSummary.style.display = 'block';
    window.scrollTo(0, 0);
    return; 
  }

  // Submit Data
  const formData = new FormData(event.target);
  const data = prepareTaskPayload(formData); // <--- Converts to UTC

  try {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      window.location.href = '/';
    } else {
      // Fallback: If the server catches something the frontend missed
      const err = await response.json();
      alert('Server Validation Error: ' + JSON.stringify(err));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// ==========================================
// 3. EDIT & DELETE LOGIC
// ==========================================
async function loadTaskForEdit(id) {
  try {
    // 1. Fetch Task AND History in parallel (Good "High Code" practice)
    const [taskRes, historyRes] = await Promise.all([
      fetch(`/api/tasks/${id}`),
      fetch(`/api/tasks/${id}/history`)
    ]);

    if (!taskRes.ok) throw new Error("Failed to load task");

    const task = await taskRes.json();
    
    // Populate Form
    document.getElementById('title').value = task.title;
    document.getElementById('description').value = task.description || '';
    document.getElementById('status').value = task.status;
    
    if(task.due_date) {
      const dateField = document.getElementById('due_date');
      
      // HTML5 datetime-local inputs require YYYY-MM-DDTHH:MM
      // If your DB sends "2025-01-20T10:00:00.000Z", we need to format it for the input
      const dateObj = new Date(task.due_date);
      
      // Adjust to local time string for the input value (simplest way for this test)
      // Note: This is a quick hack. A heavy production app would use a library like 'date-fns'
      const isoLocal = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      
      dateField.value = isoLocal;
      dateField.setAttribute('data-original-date', isoLocal); 
    }

    // 2. Render History if available
    if (historyRes.ok) {
      const history = await historyRes.json();
      renderHistory(history);
    } else {
      // High Code: Handle API 404/500 errors gracefully in the UI
      historyContainer.innerHTML = '<p class="govuk-body-s text-grey">Unable to load history.</p>';
    }

  } catch (error) {
    console.error("Error loading edit page:", error);
    // UI Feedback for the user
    if(historyContainer) {
        historyContainer.innerHTML = '<p class="govuk-body-s govuk-error-message">Error loading data.</p>';
    }
  }
}
// Renders the Audit History Section
function renderHistory(historyItems) {
  const container = document.getElementById('history-container');
  
  if (historyItems.length === 0) {
    container.innerHTML = '<p class="govuk-body-s">No history available.</p>';
    return;
  }

  const html = historyItems.map(item => {
    return `
      <div class="govuk-!-margin-bottom-4">
        <p class="govuk-body-s govuk-!-margin-bottom-1" style="font-weight:bold; white-space: pre-line;">
          ${item.change_summary}
        </p>
        <span class="govuk-body-xs" style="color: #505a5f;">
          ${formatDisplayDate(item.changed_at)}
        </span>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}
// Regex: Allows Alphanumeric + space + common punctuation (.,:;_-)
// Blocks: @ / ! $ % etc.

async function handleEditSubmit(event, id) {
  event.preventDefault();

  // Inputs
  const titleInput = document.getElementById('title');
  const descriptionInput = document.getElementById('description'); // NEW: Get Description
  const dateInput = document.getElementById('due_date');

  // Error Container Elements
  const errorSummary = document.getElementById('error-summary');
  
  // Title Error Elements
  const summaryTitleError = document.getElementById('summary-title-error');
  const titleGroup = document.getElementById('title-group');
  const titleErrorMsg = document.getElementById('title-error');
  // Specific link inside summary box for title to update text dynamically
  const summaryTitleLink = document.querySelector('#summary-title-error a');
  
  // Date Error Elements
  const summaryDateError = document.getElementById('summary-date-error');
  const dateGroup = document.getElementById('due-date-group');
  const dateErrorMsg = document.getElementById('due-date-error');
  const summaryDateLink = document.querySelector('#summary-date-error a');

  // --- RESET ALL ERRORS (Clean Slate) ---
  if(errorSummary) errorSummary.style.display = 'none';
  if(summaryTitleError) summaryTitleError.style.display = 'none';
  if(summaryDateError) summaryDateError.style.display = 'none';

  if(titleGroup) titleGroup.classList.remove('govuk-form-group--error');
  if(titleInput) titleInput.classList.remove('govuk-input--error');
  if(titleErrorMsg) titleErrorMsg.style.display = 'none';

  if(dateGroup) dateGroup.classList.remove('govuk-form-group--error');
  if(dateInput) dateInput.classList.remove('govuk-input--error');
  if(dateErrorMsg) dateErrorMsg.style.display = 'none';

  let hasError = false;
  let titleErrorMessageText = "Enter a title"; // Default message

  // --- VALIDATE TITLE ---
  const titleValue = titleInput.value.trim();

  // 1. Check Empty
  if (!titleValue) {
    hasError = true;
    titleErrorMessageText = "Enter a title";
  } 
  // 2. Check Length (Max 100)
  else if (titleValue.length > 100) {
    hasError = true;
    titleErrorMessageText = "Title must be 100 characters or less";
  }
  // 3. Check Invalid Characters
  else if (!SAFE_TEXT_REGEX.test(titleValue)) {
    hasError = true;
    titleErrorMessageText = "Title contains invalid characters (allowed: letters, numbers, spaces, and . , : ; - _)";
  }

  // --- SHOW TITLE ERRORS ---
  if (hasError && (summaryTitleError || titleGroup)) {
    if (summaryTitleLink) summaryTitleLink.innerText = titleErrorMessageText;
    if (titleErrorMsg) titleErrorMsg.innerHTML = `<span class="govuk-visually-hidden">Error:</span> ${titleErrorMessageText}`;

    if(summaryTitleError) summaryTitleError.style.display = 'block';
    if(titleGroup) titleGroup.classList.add('govuk-form-group--error');
    if(titleErrorMsg) titleErrorMsg.style.display = 'block';
    if(titleInput) titleInput.classList.add('govuk-input--error');
  }

  // --- VALIDATE DESCRIPTION (Optional but needs Safe Text check) ---
  const descValue = descriptionInput ? descriptionInput.value : '';
  if (descValue && !SAFE_TEXT_REGEX.test(descValue)) {
    // For MVP, simple alert for description errors is usually acceptable 
    // unless you want to build a full error UI for description too.
    alert("Description contains invalid characters (no @ / ! etc.)");
    hasError = true;
  }

  // --- VALIDATE DATE (The Smart Logic) ---
  const dateValue = dateInput.value;
  const originalDate = dateInput.getAttribute('data-original-date'); 
  let dateErrorMessageText = "Enter a due date and time"; 
  let dateHasError = false; // distinct flag so we don't mix title/date logic

  if (!dateValue) {
    dateHasError = true;
    hasError = true;
  } 
  else if (new Date(dateValue) < new Date() && dateValue !== originalDate) {
    dateHasError = true;
    hasError = true;
    dateErrorMessageText = "Due date must be in the future";
  }

  // --- SHOW DATE ERRORS ---
  if (dateHasError && (summaryDateError || dateGroup)) {
    if (summaryDateLink) summaryDateLink.innerText = dateErrorMessageText;
    if (dateErrorMsg) dateErrorMsg.innerHTML = `<span class="govuk-visually-hidden">Error:</span> ${dateErrorMessageText}`;

    if(summaryDateError) summaryDateError.style.display = 'block';
    if(dateGroup) dateGroup.classList.add('govuk-form-group--error');
    if(dateErrorMsg) dateErrorMsg.style.display = 'block';
    if(dateInput) dateInput.classList.add('govuk-input--error');
  }

  // --- FINAL CHECK ---
  if (hasError) {
    if(errorSummary) errorSummary.style.display = 'block';
    window.scrollTo(0, 0);
    return;
  }

  // --- SUBMIT ---
  const formData = new FormData(event.target);
  const data = prepareTaskPayload(formData); // <--- Converts to UTC

  try {
    const response = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      window.location.href = '/';
    } else {
      const err = await response.json();
      alert('Update failed: ' + (err.error || JSON.stringify(err)));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function handleDeleteClick(id) {
  if (!confirm('Are you sure you want to delete this task? This cannot be undone.')) return;

  try {
    const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (response.ok) window.location.href = '/';
    else alert('Failed to delete task');
  } catch (error) {
    console.error('Error deleting task:', error);
  }
}

// ==========================================
// 4. TABLE RENDERING & SORTING
// ==========================================
async function fetchTasks() {
  try {
    const response = await fetch('/api/tasks');
    currentTasks = await response.json();
    applyFilterAndRender();
  } catch (error) {
    console.error('Error loading tasks:', error);
  }
}

function applyFilterAndRender() {
  const filterSelect = document.getElementById('status-filter');
  const filterValue = filterSelect ? filterSelect.value : 'ALL';
  
  let tasksToRender = [...currentTasks];

  if (filterValue !== 'ALL') {
    tasksToRender = tasksToRender.filter(task => task.status === filterValue);
  }

  renderTable(tasksToRender);
}

function renderTable(tasks) {
  const tableBody = document.getElementById('task-list-body');
  tableBody.innerHTML = ''; 

  tasks.forEach(task => {
    const row = document.createElement('tr');
    row.className = 'govuk-table__row';
    
    // CRITICAL: Re-add this attribute so filtering works after a sort
    row.setAttribute('data-status', task.status);

    let statusClass = "govuk-tag--grey";
    if (task.status === 'COMPLETED') statusClass = "govuk-tag--green";
    if (task.status === 'IN_PROGRESS') statusClass = "govuk-tag--blue";
    const displayStatus = STATUS_LABELS[task.status] || task.status;
    
    // MATCHES YOUR NEW HTML STRUCTURE (6 Columns)
    row.innerHTML = `
      <td class="govuk-table__cell">${task.id}</td>
      
      <td class="govuk-table__cell">
        <a href="/edit-task/${task.id}" class="govuk-link" style="font-weight: bold;">${task.title}</a>
      </td>
      
      <td class="govuk-table__cell govuk-table__cell--description">
        <div class="app-description-truncate">
          ${task.description || ''}
        </div>
      </td>
      
      <td class="govuk-table__cell">
        <strong class="govuk-tag ${statusClass}">${displayStatus}</strong>
      </td>
      
      <td class="govuk-table__cell">${task.due_date ? new Date(task.due_date).toLocaleString() : 'N/A'}</td>
      
      <td class="govuk-table__cell">
         <a href="/edit-task/${task.id}" class="govuk-link">Edit</a>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function sortTable(column) {
  const dir = sortDirection[column] === 'asc' ? 'desc' : 'asc';
  sortDirection[column] = dir;

  currentTasks.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];
    if (valA == null) return 1; if (valB == null) return -1;
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return dir === 'asc' ? -1 : 1;
    if (valA > valB) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  updateSortIcons(column, dir);
  applyFilterAndRender();
}

function updateSortIcons(activeColumn, dir) {
  // 1. Select all sort buttons to clean them up first
  const buttons = document.querySelectorAll('.app-table-sort-button');

  buttons.forEach(btn => {
    // Check if an arrow span already exists inside this button and remove it
    const existingArrow = btn.querySelector('.sort-arrow');
    if (existingArrow) {
      existingArrow.remove();
    }
  });

  // 2. Find the currently active button
  const activeBtn = document.getElementById(`sort-${activeColumn}`);
  
  if (activeBtn) {
    // 3. Create a new span for the arrow
    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'sort-arrow'; // Class for potential CSS styling
    
    // 4. Set the arrow icon based on direction
    // \u25B2 is ▲ (Up), \u25BC is ▼ (Down)
    arrowSpan.textContent = dir === 'asc' ? ' \u25B2' : ' \u25BC'; 
    
    // 5. Append it to the button
    activeBtn.appendChild(arrowSpan);
}}