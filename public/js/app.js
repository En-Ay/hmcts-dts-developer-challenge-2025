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

  // ==========================================
  // 2. CLIENT-SIDE HYDRATION
  // ==========================================
  
  // A. HYDRATE READ-ONLY DATES (Index Page)
  // Finds elements with class "js-local-date" and renders friendly text
  document.querySelectorAll('.js-local-date').forEach(el => {
    const isoStr = el.getAttribute('data-iso');
    if (isoStr) {
      const date = new Date(isoStr);
      if (!isNaN(date.getTime())) {
        el.textContent = date.toLocaleString('en-GB', DATE_OPTIONS);
      }
    }
  });

  // B. HYDRATE INPUT FIELDS (Edit/Create Pages)
  // Finds inputs with data-iso and sets their value to "YYYY-MM-DDTHH:MM" (Local Time)
  const dateInputs = document.querySelectorAll('input[type="datetime-local"]');
  dateInputs.forEach(input => {
    const isoStr = input.getAttribute('data-iso');
    if (isoStr) {
      const d = new Date(isoStr);
      if (!isNaN(d.getTime())) {
        // Convert the stored UTC ISO string into the correct input value for <input type="datetime-local">
        const date = new Date(isoStr); // isoStr is already UTC
        const pad = (n) => n.toString().padStart(2, '0');

        // Get the local components for datetime-local input (must be LOCAL time)
        const localValue = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        input.value = localValue;
      }
    }
  });

  // C. INTERCEPT FORM SUBMISSION
  // Converts the User's Local Input -> UTC ISO String for the Server
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      const dateInput = form.querySelector('input[type="datetime-local"]');
      
      // Only intervene if date input has a value
      if (dateInput && dateInput.value) {
        // Create a HIDDEN input to send the true ISO string
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'due_date'; // This name overrides the visible input
        
        // Convert Browser Local Time -> UTC ISO
        hiddenInput.value = new Date(dateInput.value).toISOString();
        
        // Remove the name attribute from the visible input so it is NOT sent
        dateInput.removeAttribute('name');
        
        form.appendChild(hiddenInput);
      }
    });
  });

  // ==========================================
  // 3. PAGE LOGIC
  // ==========================================

  // Identify active page elements
  const tableBody = document.getElementById('task-list-body');
  const historyContainer = document.getElementById('history-container');
  const taskIdInput = document.getElementById('task-id'); 

  // --- A. HOMEPAGE LOGIC ---
  if (tableBody) {
    // Note: ensure fetchTasks() is defined if you use it, otherwise this line will error.
    if (typeof fetchTasks === 'function') {
        fetchTasks();
    }
    
    // Select ALL filter checkboxes
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    checkboxes.forEach(box => {
      // Note: ensure applyFilterAndRender is defined
      if (typeof applyFilterAndRender === 'function') {
        box.addEventListener('change', () => applyFilterAndRender());
      }
    });
  }

}); // <--- END OF DOMContentLoaded (This was missing/misplaced in your snippet)


// ==========================================
// 4. HELPER FUNCTIONS
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
// 5. HISTORY FUNCTIONS
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