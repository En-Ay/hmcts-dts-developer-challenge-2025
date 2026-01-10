// Global State
let currentTasks = [];
let currentSort = { field: 'due_date', direction: 'asc' };

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

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize GDS Components
  if (window.GOVUKFrontend) {
    window.GOVUKFrontend.initAll();
  }

  // 2. Identify active page elements
  const tableBody = document.getElementById('task-list-body');
  const historyContainer = document.getElementById('history-container');
  const taskIdInput = document.getElementById('task-id'); // <--- The Hidden Input

  // --- A. HOMEPAGE LOGIC ---
  if (tableBody) {
    fetchTasks();
    
    // Select ALL filter checkboxes
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    checkboxes.forEach(box => {
      box.addEventListener('change', () => applyFilterAndRender());
    });
  }

  // --- B. EDIT PAGE LOGIC (History) ---
  // We check for the container AND the hidden ID input
  if (historyContainer && taskIdInput) {
    const taskId = taskIdInput.value;
    
    // Load History immediately
    fetchTaskHistory(taskId);
    
    // Adjust height on resize
    window.addEventListener('resize', adjustHistoryHeight);
  }

});

// ==========================================
// 1. HELPERS
// ==========================================
function formatDisplayDate(isoString) {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleString('en-GB', DATE_OPTIONS);
}

function adjustHistoryHeight() {
  const container = document.getElementById('history-container');
  if(container) container.style.maxHeight = (window.innerHeight - 300) + 'px';
}


// ==========================================
// 3. HISTORY LOGIC (Extracted from old loadTaskForEdit)
// ==========================================
async function fetchTaskHistory(id) {
  const container = document.getElementById('history-container');
  try {
    const res = await fetch(`/api/tasks/${id}/history`);
    if (res.ok) {
      const history = await res.json();
      renderHistory(history);
    } else {
      container.innerHTML = '<p class="govuk-body-s text-grey">No history available.</p>';
    }
  } catch (error) {
    console.error("History error", error);
    container.innerHTML = '<p class="govuk-body-s govuk-error-message">Failed to load history.</p>';
  }
}

function renderHistory(historyItems) {
  const container = document.getElementById('history-container');
  
  if (!historyItems || historyItems.length === 0) {
    container.innerHTML = '<p class="govuk-body-s">No history available.</p>';
    return;
  }

  const html = historyItems.map(item => `
      <div class="govuk-!-margin-bottom-4">
        <p class="govuk-body-s govuk-!-margin-bottom-1" style="font-weight:bold; white-space: pre-line;">
          ${item.change_summary}
        </p>
        <span class="govuk-body-xs" style="color: #505a5f;">
          ${formatDisplayDate(item.changed_at)}
        </span>
      </div>
  `).join('');

  container.innerHTML = html;
}

// ==========================================
// 4. HOMEPAGE TABLE LOGIC (Keep all of this)
// ==========================================
async function fetchTasks() {
  try {
    const response = await fetch('/api/tasks');
    window.currentTasks = await response.json(); 
    updateOverdueCount(window.currentTasks);
    restoreFilterState();
    applyFilterAndRender();
  } catch (error) {
    console.error('Error loading tasks:', error);
  }
}

function restoreFilterState() {
  const savedJSON = sessionStorage.getItem('taskFilters');
  if (!savedJSON) return;
  const savedValues = JSON.parse(savedJSON);
  const checkboxes = document.querySelectorAll('.filter-checkbox');
  checkboxes.forEach(box => {
    box.checked = savedValues.includes(box.value);
  });
}

function sortTable(column) {
  if (currentSort.field === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.field = column;
    currentSort.direction = 'asc';
  }
  updateSortIcons(column, currentSort.direction);
  applyFilterAndRender();
}

function applyFilterAndRender() {
  const checkedBoxes = document.querySelectorAll('.filter-checkbox:checked');
  const selectedValues = Array.from(checkedBoxes).map(cb => cb.value);
  sessionStorage.setItem('taskFilters', JSON.stringify(selectedValues));
  
  let tasks = [...(window.currentTasks || [])];

  if (selectedValues.length === 0) {
    tasks = []; 
  } else {
    const showOverdueOnly = selectedValues.includes('OVERDUE');
    tasks = tasks.filter(t => {
      const matchesStatus = selectedValues.includes(t.status);
      if (showOverdueOnly) {
        return matchesStatus && (t.status !== 'COMPLETED' && new Date(t.due_date) < new Date());
      }
      return matchesStatus;
    });
  }

  // Sorting
  tasks.sort((a, b) => {
    let valA = a[currentSort.field];
    let valB = b[currentSort.field];
    if (valA == null) return 1; if (valB == null) return -1;

    if (currentSort.field === 'id') {
      return (Number(valA) - Number(valB)) * (currentSort.direction === 'asc' ? 1 : -1);
    }
    if (currentSort.field === 'due_date') {
      return (new Date(valA).getTime() - new Date(valB).getTime()) * (currentSort.direction === 'asc' ? 1 : -1);
    }
    if (typeof valA === 'string') {
      valA = valA.toLowerCase(); valB = valB.toLowerCase();
    }
    if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
    if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  renderTable(tasks);
}

function updateOverdueCount(tasks) {
  const container = document.getElementById('overdue-stat-box');
  const countEl = document.getElementById('overdue-count');
  if (!container || !countEl) return;

  const now = new Date();
  const overdueCount = tasks.filter(t => t.status !== 'COMPLETED' && new Date(t.due_date) < now).length;
  countEl.textContent = overdueCount;
  container.style.display = overdueCount > 0 ? 'block' : 'none';
}

function renderTable(tasks) {
  const tableBody = document.getElementById('task-list-body');
  tableBody.innerHTML = ''; 

  if (tasks.length === 0) {
    const totalTasksInSystem = window.currentTasks ? window.currentTasks.length : 0;
    let message = totalTasksInSystem === 0 ? "You have no tasks yet." : "No tasks match your selected filters.";
    tableBody.innerHTML = `
      <tr class="govuk-table__row">
        <td class="govuk-table__cell" colspan="6" style="text-align: center; padding: 30px 0; color: #505a5f;">
           ${message}
        </td>
      </tr>`;
    return;
  }

  tasks.forEach(task => {
    const row = document.createElement('tr');
    row.className = 'govuk-table__row';
    let statusClass = "govuk-tag--grey";
    if (task.status === 'COMPLETED') statusClass = "govuk-tag--green";
    if (task.status === 'IN_PROGRESS') statusClass = "govuk-tag--blue";
    
    const displayStatus = STATUS_LABELS[task.status] || task.status;
    const dateStr = formatDisplayDate(task.due_date);

    row.innerHTML = `
      <td class="govuk-table__cell">${task.id}</td>
      <td class="govuk-table__cell"><a href="/edit-task/${task.id}" class="govuk-link" style="font-weight: bold;">${task.title}</a></td>
      <td class="govuk-table__cell govuk-table__cell--description"><div class="app-description-truncate">${task.description || ''}</div></td>
      <td class="govuk-table__cell"><strong class="govuk-tag ${statusClass}">${displayStatus}</strong></td>
      <td class="govuk-table__cell">${dateStr}</td>
      <td class="govuk-table__cell"><a href="/edit-task/${task.id}" class="govuk-link">Edit</a></td>
    `;
    tableBody.appendChild(row);
  });
}

function updateSortIcons(activeColumn, dir) {
  const buttons = document.querySelectorAll('.app-table-sort-button');
  buttons.forEach(btn => {
    const existingArrow = btn.querySelector('.sort-arrow');
    if (existingArrow) existingArrow.remove();
  });
  const activeBtn = document.getElementById(`sort-${activeColumn}`);
  if (activeBtn) {
    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'sort-arrow';
    arrowSpan.textContent = dir === 'asc' ? ' \u25B2' : ' \u25BC';
    activeBtn.appendChild(arrowSpan);
  }
}