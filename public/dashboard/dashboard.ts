const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement | null;
const createTaskForm = document.getElementById("createTaskForm") as HTMLFormElement | null;
const tasksList = document.getElementById("tasksList") as HTMLElement | null;
const feedback = document.getElementById("feedback") as HTMLElement | null;

if (!logoutBtn || !createTaskForm || !tasksList || !feedback) {
    throw new Error("Missing required dashboard elements");
}

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
    const data = Object.fromEntries(formData.entries());

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
        tasksList.innerHTML = tasks.map(task => `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <span class="task-type">${escapeHtml(task.type)}</span>
                </div>
                <div class="task-date">📅 ${formatDate(task.date)}</div>
                ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
                <div class="task-actions">
                    <button class="task-btn task-btn-delete" data-task-id="${escapeHtml(task.id)}">Delete</button>
                </div>
            </div>
        `).join('');
        
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
