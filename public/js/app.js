// Global State
let currentTasks = [];
let sortDirection = {}; 

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
// 1. CREATE TASK (Dual Validation + Business Logic)
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
  const data = Object.fromEntries(formData.entries());

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
// 2. EDIT & DELETE LOGIC
// ==========================================
async function loadTaskForEdit(id) {
  const res = await fetch(`/api/tasks/${id}`);
  const task = await res.json();
  
  document.getElementById('title').value = task.title;
  document.getElementById('description').value = task.description || '';
  document.getElementById('status').value = task.status;
  if(task.due_date) document.getElementById('due_date').value = task.due_date;
}

async function handleEditSubmit(event, id) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const data = Object.fromEntries(formData.entries());

  const response = await fetch(`/api/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (response.ok) window.location.href = '/';
  else alert('Update failed');
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
// 3. TABLE RENDERING & SORTING
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

  // 1. Define Human-Readable Mappings
  const statusLabels = {
    'PENDING': 'Pending',
    'IN_PROGRESS': 'In Progress',
    'COMPLETED': 'Completed'
  };

  tasks.forEach(task => {
    const row = document.createElement('tr');
    row.className = 'govuk-table__row';

    let statusClass = "govuk-tag--grey";
    if (task.status === 'COMPLETED') statusClass = "govuk-tag--green";
    if (task.status === 'IN_PROGRESS') statusClass = "govuk-tag--blue";

    // 2. Get the clean text (fallback to raw value if missing)
    const displayStatus = statusLabels[task.status] || task.status;

    row.innerHTML = `
      <td class="govuk-table__cell text-grey">${task.id}</td>
      <td class="govuk-table__cell"><strong>${task.title}</strong></td>
      <td class="govuk-table__cell">${task.description || '-'}</td>
      
      <td class="govuk-table__cell"><strong class="govuk-tag ${statusClass}">${displayStatus}</strong></td>
      
      <td class="govuk-table__cell">${task.created_at ? new Date(task.created_at).toLocaleDateString() : 'Now'}</td>
      <td class="govuk-table__cell">${task.due_date ? new Date(task.due_date).toLocaleString() : 'N/A'}</td>
      <td class="govuk-table__cell text-grey">${task.updated_at ? new Date(task.updated_at).toLocaleString() : 'Never'}</td>
      <td class="govuk-table__cell">
         <a href="/edit-task/${task.id}" class="govuk-link govuk-link--no-visited-state">Edit</a>
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
  }
}