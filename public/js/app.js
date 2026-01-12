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
