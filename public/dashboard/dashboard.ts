const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement | null;
const createTaskForm = document.getElementById("createTaskForm") as HTMLFormElement | null;
const tasksList = document.getElementById("tasksList") as HTMLElement | null;
const feedback = document.getElementById("feedback") as HTMLElement | null;
const taskTypeOneTime = document.getElementById("taskTypeOneTime") as HTMLInputElement | null;
const taskTypeRecurring = document.getElementById("taskTypeRecurring") as HTMLInputElement | null;
const oneTimeGroup = document.getElementById("oneTimeGroup") as HTMLElement | null;
const recurringDaysGroup = document.getElementById("recurringDaysGroup") as HTMLElement | null;
const recurringTimeGroup = document.getElementById("recurringTimeGroup") as HTMLElement | null;

if (!logoutBtn || !createTaskForm || !tasksList || !feedback || !taskTypeOneTime || !taskTypeRecurring) {
    throw new Error("Missing required dashboard elements");
}

// Handle task type selection (ONE_TIME vs RECURRING)
function updateTaskTypeDisplay() {
    if (taskTypeOneTime && taskTypeOneTime.checked) {
        if (oneTimeGroup) oneTimeGroup.style.display = "block";
        if (recurringDaysGroup) recurringDaysGroup.style.display = "none";
        if (recurringTimeGroup) recurringTimeGroup.style.display = "none";
        const dateInput = document.getElementById("taskDate") as HTMLInputElement | null;
        if (dateInput) dateInput.required = true;
    } else if (taskTypeRecurring && taskTypeRecurring.checked) {
        if (oneTimeGroup) oneTimeGroup.style.display = "none";
        if (recurringDaysGroup) recurringDaysGroup.style.display = "block";
        if (recurringTimeGroup) recurringTimeGroup.style.display = "block";
        const dateInput = document.getElementById("taskDate") as HTMLInputElement | null;
        if (dateInput) dateInput.required = false;
    }
}

taskTypeOneTime.addEventListener("change", updateTaskTypeDisplay);
taskTypeRecurring.addEventListener("change", updateTaskTypeDisplay);

// Logout functionality
logoutBtn.addEventListener("click", async () => {
    const response = await fetch("/logout/", {
        method: "GET",
    });

    const result = await response.json();
    if (result.success) {
        window.location.href = result.redirect;
    }
});

// Create task functionality
createTaskForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(createTaskForm);
    const taskType = formData.get("taskType") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;

    let data: any = {
        type: taskType,
        title,
        description: description || undefined
    };

    if (taskType === "ONE_TIME") {
        const date = formData.get("date") as string;
        if (!date) {
            showFeedback("Date is required for one-time tasks", "error");
            return;
        }
        data.date = date;
    } else if (taskType === "RECURRING") {
        const daysFormData = formData.getAll("days") as string[];
        if (daysFormData.length === 0) {
            showFeedback("Please select at least one day for recurring tasks", "error");
            return;
        }
        const hour = formData.get("hour") as string;
        const minute = formData.get("minute") as string;
        const ampm = formData.get("ampm") as string;
        
        if (!hour || !minute || !ampm) {
            showFeedback("Time is required for recurring tasks", "error");
            return;
        }
        
        // Convert 12-hour format to 24-hour format
        let hour24 = parseInt(hour);
        if (ampm === "AM") {
            if (hour24 === 12) hour24 = 0;
        } else if (ampm === "PM") {
            if (hour24 !== 12) hour24 += 12;
        }
        
        data.days = daysFormData;
        data.time = {
            hour: hour24,
            minute: parseInt(minute)
        };
    }

    try {
        const response = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
            showFeedback("Task created successfully!", "success");
            createTaskForm.reset();
            // Reset the form display
            if (taskTypeOneTime) taskTypeOneTime.checked = false;
            if (taskTypeRecurring) taskTypeRecurring.checked = false;
            updateTaskTypeDisplay();
            if (oneTimeGroup) oneTimeGroup.style.display = "block";
            if (recurringDaysGroup) recurringDaysGroup.style.display = "none";
            if (recurringTimeGroup) recurringTimeGroup.style.display = "none";
            loadTasks();
        } else {
            showFeedback(result.message || "Failed to create task", "error");
        }
    } catch (error) {
        showFeedback("Error creating task. Please try again.", "error");
    }
});

// Load and display tasks
async function loadTasks() {
    try {
        const response = await fetch("/api/tasks", {
            method: "GET",
        });

        const result = await response.json();
        if (result.success) {
            displayTasks(result.tasks || []);
        }
    } catch (error) {
        console.error("Error loading tasks:", error);
        showFeedback("Error loading tasks", "error");
    }
}

// Display tasks in the list
function displayTasks(tasks: any[]) {
    if (!tasks || tasks.length === 0) {
        if (tasksList) {
            tasksList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <p>No tasks yet</p>
                    <p style="font-size: 12px; color: #ccc;">Create your first task to get started</p>
                </div>
            `;
        }
        return;
    }

    if (tasksList) {
        tasksList.innerHTML = tasks.map(task => {
            let taskDetailsHtml = '';
            
            if (task.type === 'ONE_TIME') {
                taskDetailsHtml = `<div class="task-date">📅 ${formatDate(task.date)}</div>`;
                if (task.completed) {
                    taskDetailsHtml += `<div class="task-status"><span class="status-badge completed">✓ Completed</span></div>`;
                }
            } else if (task.type === 'RECURRING') {
                const daysDisplay = task.days ? task.days.join(', ') : 'No days set';
                
                // Convert 24-hour format to 12-hour format with AM/PM
                let hour12 = task.time ? task.time.hour : 0;
                let ampm = 'AM';
                if (hour12 >= 12) {
                    ampm = 'PM';
                    if (hour12 > 12) hour12 -= 12;
                } else if (hour12 === 0) {
                    hour12 = 12;
                }
                
                const timeDisplay = task.time ? `${hour12}:${String(task.time.minute).padStart(2, '0')} ${ampm}` : 'No time set';
                taskDetailsHtml = `
                    <div class="task-recurring-info">
                        <div class="task-days">📆 ${daysDisplay}</div>
                        <div class="task-time">🕐 ${timeDisplay}</div>
                    </div>
                `;
            }

            return `
                <div class="task-card">
                    <div class="task-header">
                        <div class="task-title">${escapeHtml(task.title)}</div>
                        <span class="task-type ${task.type === 'ONE_TIME' ? 'one-time' : 'recurring'}">${escapeHtml(task.type)}</span>
                    </div>
                    ${taskDetailsHtml}
                    ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
                    <div class="task-actions">
                        <button class="task-btn task-btn-delete" data-task-id="${escapeHtml(task.id)}">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners to delete buttons using event delegation
        const deleteButtons = tasksList.querySelectorAll('.task-btn-delete');
        deleteButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                const taskId = (button as HTMLButtonElement).getAttribute('data-task-id');
                if (taskId) {
                    await deleteTask(taskId);
                }
            });
        });
    }
}

// Delete task
async function deleteTask(taskId: string) {
    //if (!confirm("Are you sure you want to delete this task?")) return;

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: "DELETE",
        });

        const result = await response.json();
        if (result.success) {
            showFeedback("Task deleted successfully", "success");
            loadTasks();
        } else {
            showFeedback(result.message || "Failed to delete task", "error");
        }
    } catch (error) {
        showFeedback("Error deleting task", "error");
    }
}

// Show feedback message
function showFeedback(message: string, type: "success" | "error") {
    if (feedback) {
        feedback.textContent = message;
        feedback.classList.add("show", type);
        feedback.classList.remove(type === "success" ? "error" : "success");

        setTimeout(() => {
            feedback.classList.remove("show");
        }, 4000);
    }
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(text: string | undefined | null): string {
    if (!text) return '';
    const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Utility: Format date
function formatDate(dateString: string | undefined | null): string {
    if (!dateString) return 'No date';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateString;
    }
}

// Load tasks on page load
loadTasks();
