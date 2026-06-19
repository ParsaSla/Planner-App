const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement | null;
const createTaskForm = document.getElementById("createTaskForm") as HTMLFormElement | null;
const tasksList = document.getElementById("tasksList") as HTMLElement | null;
const feedback = document.getElementById("feedback") as HTMLElement | null;
const taskTypeOneTime = document.getElementById("taskTypeOneTime") as HTMLInputElement | null;
const taskTypeRecurring = document.getElementById("taskTypeRecurring") as HTMLInputElement | null;
const oneTimeGroup = document.getElementById("oneTimeGroup") as HTMLElement | null;
const recurringDaysGroup = document.getElementById("recurringDaysGroup") as HTMLElement | null;
const recurringTimeGroup = document.getElementById("recurringTimeGroup") as HTMLElement | null;
const taskIdInput = document.getElementById("taskId") as HTMLInputElement | null;
const cancelEditBtn = document.getElementById("cancelEditBtn") as HTMLButtonElement | null;
const calendarElement = document.getElementById("calendar") as HTMLElement | null;
const currentMonthElement = document.getElementById("currentMonth") as HTMLElement | null;
const prevMonthBtn = document.getElementById("prevMonth") as HTMLButtonElement | null;
const nextMonthBtn = document.getElementById("nextMonth") as HTMLButtonElement | null;
const calendarEventsElement = document.getElementById("calendarEvents") as HTMLElement | null;

if (!logoutBtn || !createTaskForm || !tasksList || !feedback || !taskTypeOneTime || !taskTypeRecurring || !taskIdInput || !cancelEditBtn) {
    throw new Error("Missing required dashboard elements");
}

let editingTaskId: string | null = null;
let currentDate = new Date();
let allTasks: any[] = [];
let allCourses: any[] = [];
let activeCourseFilter: string | null = null; // null = show all

function resetTaskForm() {
    createTaskForm!.reset();
    editingTaskId = null;
    if (taskIdInput) taskIdInput.value = '';
    if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    const submitButton = createTaskForm!.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitButton) submitButton.textContent = 'Create Task';
    taskTypeOneTime!.checked = true;
    taskTypeRecurring!.checked = false;
    const courseSelect = document.getElementById('taskCourse') as HTMLSelectElement | null;
    if (courseSelect) courseSelect.value = '';
    updateTaskTypeDisplay();
}

function populateTaskForm(task: any) {
    editingTaskId = task.id;
    if (taskIdInput) taskIdInput.value = task.id;

    const submitButton = createTaskForm!.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitButton) submitButton.textContent = 'Save Changes';
    if (cancelEditBtn) cancelEditBtn.style.display = 'inline-block';

    const titleInput = document.getElementById('taskTitle') as HTMLInputElement | null;
    const descriptionInput = document.getElementById('taskDescription') as HTMLTextAreaElement | null;
    const dateInput = document.getElementById('taskDate') as HTMLInputElement | null;
    const hourInput = document.getElementById('taskHour') as HTMLInputElement | null;
    const minuteInput = document.getElementById('taskMinute') as HTMLInputElement | null;
    const ampmInputs = Array.from(document.querySelectorAll('input[name="ampm"]')) as HTMLInputElement[];
    const dayCheckboxes = Array.from(document.querySelectorAll('input[name="days"]')) as HTMLInputElement[];

    if (titleInput) titleInput.value = task.title || '';
    if (descriptionInput) descriptionInput.value = task.description || '';
    const courseSelect = document.getElementById('taskCourse') as HTMLSelectElement | null;
    if (courseSelect) courseSelect.value = task.course_id || '';

    if (task.type === 'ONE_TIME') {
        taskTypeOneTime!.checked = true;
        taskTypeRecurring!.checked = false;
        updateTaskTypeDisplay();
        if (dateInput) {
            const dateValue = task.date ? new Date(task.date).toISOString().split('T')[0] : '';
            dateInput.value = dateValue;
        }
    } else {
        taskTypeOneTime!.checked = false;
        taskTypeRecurring!.checked = true;
        updateTaskTypeDisplay();
        if (dayCheckboxes) {
            dayCheckboxes.forEach(checkbox => {
                checkbox.checked = task.days ? task.days.includes(checkbox.value) : false;
            });
        }
        if (task.time && hourInput && minuteInput && ampmInputs.length > 0) {
            let hour24 = task.time.hour;
            let ampm = 'AM';
            if (hour24 >= 12) {
                ampm = 'PM';
                if (hour24 > 12) hour24 -= 12;
            } else if (hour24 === 0) {
                hour24 = 12;
            }
            hourInput.value = String(hour24);
            minuteInput.value = String(task.time.minute ?? 0).padStart(2, '0');
            ampmInputs.forEach(input => {
                input.checked = input.value === ampm;
            });
        }
    }
}

cancelEditBtn.addEventListener('click', () => {
    resetTaskForm();
});

if (tasksList) {
    tasksList.addEventListener('change', async (event) => {
        const target = event.target as HTMLElement;
        const checkbox = target as HTMLInputElement;

        if (target.matches('.task-complete-checkbox')) {
            const taskId = checkbox.getAttribute('data-task-id');
            if (!taskId) return;
            try {
                const response = await fetch(`/api/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ completed: checkbox.checked }),
                });
                const result = await response.json();
                if (result.success) {
                    showFeedback('Task updated successfully', 'success');
                    loadTasks();
                } else {
                    showFeedback(result.error || 'Failed to update task', 'error');
                    loadTasks();
                }
            } catch (error) {
                showFeedback('Error updating task', 'error');
                loadTasks();
            }
        } else if (target.matches('.task-instance-checkbox')) {
            const taskId = checkbox.getAttribute('data-task-id');
            const instanceDate = checkbox.getAttribute('data-instance-date');
            if (!taskId || !instanceDate) return;
            try {
                const response = await fetch(`/api/tasks/${taskId}/instance`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instanceDate, completed: checkbox.checked }),
                });
                const result = await response.json();
                if (result.success) {
                    showFeedback('Task updated successfully', 'success');
                    loadTasks();
                } else {
                    showFeedback(result.error || 'Failed to update task', 'error');
                    loadTasks();
                }
            } catch (error) {
                showFeedback('Error updating task', 'error');
                loadTasks();
            }
        }
    });

        tasksList.addEventListener('click', async (event) => {
            const button = (event.target as HTMLElement).closest('.task-btn-edit') as HTMLButtonElement | null;
            if (!button) return;
            event.preventDefault();
            const taskId = button.getAttribute('data-task-id');
            if (!taskId) return;

            const tasks = allTasks || [];
            const task = tasks.find(t => t.id === taskId);
            if (!task) {
                showFeedback('Task not found in list', 'error');
                return;
            }

            populateTaskForm(task);
        });
    }

// Handle task type selection (ONE_TIME vs RECURRING)
function updateTaskTypeDisplay() {
    if (taskTypeOneTime!.checked) {
        if (oneTimeGroup) oneTimeGroup.style.display = "block";
        if (recurringDaysGroup) recurringDaysGroup.style.display = "none";
        if (recurringTimeGroup) recurringTimeGroup.style.display = "none";
        const dateInput = document.getElementById("taskDate") as HTMLInputElement | null;
        if (dateInput) dateInput.required = true;
    } else if (taskTypeRecurring!.checked) {
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
    const courseId = formData.get("courseId") as string;
    const taskId = taskIdInput ? taskIdInput.value : null;

    let data: any = {
        type: taskType,
        title,
        description: description || undefined,
        courseId: courseId || undefined,
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
        const method = taskId ? 'PUT' : 'POST';
        const url = taskId ? `/api/tasks/${encodeURIComponent(taskId)}` : '/api/tasks';
        const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
            showFeedback(taskId ? "Task updated successfully!" : "Task created successfully!", "success");
            resetTaskForm();
            loadTasks();
        } else {
            showFeedback(result.message || (taskId ? "Failed to update task" : "Failed to create task"), "error");
        }
    } catch (error) {
        showFeedback(taskId ? "Error updating task. Please try again." : "Error creating task. Please try again.", "error");
    }
});

// Load and display tasks
async function loadTasks() {
    try {
        const response = await fetch("/api/tasks", { method: "GET" });
        const result = await response.json();
        if (result.success) {
            allTasks = result.tasks || [];
            displayTasks(allTasks);
            generateCalendar(allTasks);
        }
    } catch (error) {
        console.error("Error loading tasks:", error);
        showFeedback("Error loading tasks", "error");
    }
}

async function loadCourses() {
    try {
        const response = await fetch("/api/courses", { method: "GET" });
        const result = await response.json();
        if (result.success) {
            allCourses = result.courses || [];
            populateCourseSelector();
            renderCoursesList();
            renderCourseFilters();
        }
    } catch (error) {
        console.error("Error loading courses:", error);
    }
}

function populateCourseSelector() {
    const select = document.getElementById('taskCourse') as HTMLSelectElement | null;
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">— No Course —</option>';
    allCourses.forEach(course => {
        const opt = document.createElement('option');
        opt.value = course.id;
        opt.textContent = course.code ? `${course.code} – ${course.name}` : course.name;
        select.appendChild(opt);
    });
    select.value = current;
}

function renderCourseFilters() {
    const container = document.getElementById('courseFilters');
    if (!container) return;
    let html = `<button class="course-filter-btn ${activeCourseFilter === null ? 'active' : ''}" data-filter="">All</button>`;
    allCourses.forEach(course => {
        const color = course.color || '#667eea';
        const isActive = activeCourseFilter === course.id;
        html += `<button class="course-filter-btn ${isActive ? 'active' : ''}" data-filter="${escapeHtml(course.id)}" style="--course-color:${escapeHtml(color)}">${escapeHtml(course.code || course.name)}</button>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.course-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = (btn as HTMLElement).getAttribute('data-filter');
            activeCourseFilter = filter || null;
            renderCourseFilters();
            displayTasks(allTasks);
        });
    });
}

function renderCoursesList() {
    const container = document.getElementById('coursesList');
    if (!container) return;
    if (allCourses.length === 0) {
        container.innerHTML = '<p class="no-courses-msg">No courses yet. Add one above.</p>';
        return;
    }
    container.innerHTML = allCourses.map(course => {
        const color = course.color || '#667eea';
        const label = course.code ? `<strong>${escapeHtml(course.code)}</strong> – ${escapeHtml(course.name)}` : `<strong>${escapeHtml(course.name)}</strong>`;
        return `
            <div class="course-chip" style="border-left: 4px solid ${escapeHtml(color)}">
                <span class="course-dot" style="background:${escapeHtml(color)}"></span>
                <span class="course-chip-label">${label}</span>
                <button class="course-delete-btn" data-course-id="${escapeHtml(course.id)}" title="Delete course">✕</button>
            </div>
        `;
    }).join('');
    container.querySelectorAll('.course-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const courseId = (btn as HTMLElement).getAttribute('data-course-id');
            if (courseId) await deleteCourseUI(courseId);
        });
    });
}

async function deleteCourseUI(courseId: string) {
    try {
        const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            if (activeCourseFilter === courseId) activeCourseFilter = null;
            await loadCourses();
            await loadTasks();
        } else {
            showFeedback(result.error || 'Failed to delete course', 'error');
        }
    } catch {
        showFeedback('Error deleting course', 'error');
    }
}

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function expandRecurringTasks(tasks: any[], weeks = 4): any[] {
    const instances: any[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + weeks * 7);

    for (const task of tasks.filter(t => t.type === 'RECURRING')) {
        if (!task.days?.length) continue;
        const cursor = new Date(today);
        while (cursor <= endDate) {
            if (task.days.includes(DAY_NAMES[cursor.getDay()])) {
                const instanceDate = new Date(cursor);
                if (task.time) instanceDate.setHours(task.time.hour, task.time.minute, 0, 0);
                const instanceDateStr = cursor.toISOString().split('T')[0];
                const completed = Array.isArray(task.completedDates) && task.completedDates.includes(instanceDateStr);
                instances.push({ ...task, _instanceDate: new Date(instanceDate), _instanceDateStr: instanceDateStr, completed });
            }
            cursor.setDate(cursor.getDate() + 1);
        }
    }
    return instances;
}

function getCourseById(id: string) {
    return allCourses.find((c: any) => c.id === id) || null;
}

function courseBadgeHtml(courseId: string | undefined): string {
    if (!courseId) return '';
    const course = getCourseById(courseId);
    if (!course) return '';
    const color = course.color || '#667eea';
    const label = course.code || course.name;
    return `<span class="course-badge" style="background:${escapeHtml(color)}">${escapeHtml(label)}</span>`;
}

// Display tasks in the list
function displayTasks(tasks: any[]) {
    // Apply course filter
    const filtered = activeCourseFilter
        ? tasks.filter(t => t.course_id === activeCourseFilter)
        : tasks;

    const oneTime = filtered.filter(t => t.type === 'ONE_TIME');
    const recurringInstances = expandRecurringTasks(filtered);

    const allItems = [
        ...oneTime.map(t => ({ ...t, _sortDate: new Date(t.date) })),
        ...recurringInstances.map(t => ({ ...t, _sortDate: t._instanceDate as Date })),
    ].sort((a, b) => +a._sortDate - +b._sortDate);

    if (!tasksList) return;

    if (allItems.length === 0) {
        tasksList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <p>No tasks yet</p>
                <p style="font-size: 12px; color: #ccc;">Create your first task to get started</p>
            </div>
        `;
        return;
    }

    tasksList.innerHTML = allItems.map(task => {
        let taskDetailsHtml = '';

        if (task.type === 'ONE_TIME') {
            taskDetailsHtml = `<div class="task-date">📅 ${formatDate(task.date)}</div>`;
            if (task.completed) {
                taskDetailsHtml += `<div class="task-status"><span class="status-badge completed">✓ Completed</span></div>`;
            }
        } else {
            const d = task._instanceDate as Date;
            const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            let hour12 = task.time ? task.time.hour : 0;
            let ampm = 'AM';
            if (hour12 >= 12) { ampm = 'PM'; if (hour12 > 12) hour12 -= 12; }
            else if (hour12 === 0) hour12 = 12;
            const timeStr = task.time ? ` at ${hour12}:${String(task.time.minute).padStart(2, '0')} ${ampm}` : '';
            taskDetailsHtml = `<div class="task-date">📅 ${dateStr}${timeStr}</div>`;
        }

        const taskCardClass = task.completed ? 'task-card completed' : 'task-card';
        const completionToggle = task.type === 'ONE_TIME' ? `
            <label class="task-complete-toggle">
                <input type="checkbox" class="task-complete-checkbox" data-task-id="${escapeHtml(task.id)}" ${task.completed ? 'checked' : ''}>
                <span>${task.completed ? 'Completed' : 'Mark complete'}</span>
            </label>
        ` : `
            <label class="task-complete-toggle">
                <input type="checkbox" class="task-instance-checkbox" data-task-id="${escapeHtml(task.id)}" data-instance-date="${escapeHtml(task._instanceDateStr)}" ${task.completed ? 'checked' : ''}>
                <span>${task.completed ? 'Completed' : 'Mark complete'}</span>
            </label>
        `;

        return `
            <div class="${taskCardClass}">
                <div class="task-header">
                    <div class="task-title">${escapeHtml(task.title)}${courseBadgeHtml(task.course_id)}</div>
                    <span class="task-type ${task.type === 'ONE_TIME' ? 'one-time' : 'recurring'}">${task.type === 'ONE_TIME' ? 'ONE TIME' : 'RECURRING'}</span>
                </div>
                ${taskDetailsHtml}
                ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
                <div class="task-actions">
                    ${completionToggle}
                    <button class="task-btn task-btn-edit" data-task-id="${escapeHtml(task.id)}">Edit</button>
                    <button class="task-btn task-btn-delete" data-task-id="${escapeHtml(task.id)}">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    const deleteButtons = tasksList.querySelectorAll('.task-btn-delete');
    deleteButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const taskId = (button as HTMLButtonElement).getAttribute('data-task-id');
            if (taskId) await deleteTask(taskId);
        });
    });
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

// Calendar functions
function generateCalendar(tasks: any[]) {
    if (!calendarElement || !currentMonthElement) return;
    
    allTasks = tasks;
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    currentMonthElement.textContent = `${monthNames[month]} ${year}`;
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    let html = '<div class="calendar-weekdays">';
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    weekdays.forEach(day => {
        html += `<div class="calendar-weekday">${day}</div>`;
    });
    html += '</div><div class="calendar-days">';
    
    // Previous month's days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        html += `<div class="calendar-day other-month">${day}</div>`;
    }
    
    // Current month's days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateString = date.toISOString().split('T')[0];
        
        // Check if this day has events
        const hasEvent = tasks.some(task => {
            if (task.type === 'ONE_TIME') {
                const taskDate = new Date(task.date).toISOString().split('T')[0];
                return taskDate === dateString;
            } else if (task.type === 'RECURRING') {
                const dayOfWeek = date.getDay();
                const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
                return task.days && task.days.includes(dayNames[dayOfWeek]);
            }
            return false;
        });
        
        const isToday = date.toDateString() === today.toDateString();
        const classes = ['calendar-day'];
        if (hasEvent) classes.push('has-event');
        if (isToday) classes.push('today');
        
        html += `<div class="${classes.join(' ')}" data-date="${dateString}">${day}</div>`;
    }
    
    // Next month's days
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    for (let day = 1; day <= totalCells - firstDay - daysInMonth; day++) {
        html += `<div class="calendar-day other-month">${day}</div>`;
    }
    
    html += '</div>';
    calendarElement.innerHTML = html;
    
    // Add click event listeners to calendar days
    const calendarDays = calendarElement.querySelectorAll('.calendar-day:not(.other-month)');
    calendarDays.forEach(dayElement => {
        dayElement.addEventListener('click', () => {
            const dateString = (dayElement as HTMLElement).getAttribute('data-date');
            if (dateString) {
                updateCalendarEvents(dateString, tasks);
            }
        });
    });
    
    // Show events for today on initial load
    const todayString = today.toISOString().split('T')[0];
    updateCalendarEvents(todayString, tasks);
}

function updateCalendarEvents(dateString: string, tasks: any[]) {
    if (!calendarEventsElement) return;
    
    const selectedDate = new Date(dateString);
    const dayOfWeek = selectedDate.getDay();
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    
    // Get events for selected date
    const dayEvents = tasks.filter(task => {
        if (task.type === 'ONE_TIME') {
            const taskDate = new Date(task.date).toISOString().split('T')[0];
            return taskDate === dateString;
        } else if (task.type === 'RECURRING') {
            return task.days && task.days.includes(dayNames[dayOfWeek]);
        }
        return false;
    });
    
    let html = `<h4>${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</h4>`;
    
    if (dayEvents.length === 0) {
        html += '<p style="color: #999; font-size: 12px;">No events scheduled</p>';
    } else {
        dayEvents.forEach(event => {
            const eventClass = event.type === 'RECURRING' ? 'recurring' : '';
            const timeStr = event.type === 'RECURRING' && event.time 
                ? `${event.time.hour}:${String(event.time.minute).padStart(2, '0')}`
                : '';
            html += `<div class="calendar-event-item ${eventClass}">
                <strong>${escapeHtml(event.title)}</strong>
                ${timeStr ? `<br><small>${timeStr}</small>` : ''}
            </div>`;
        });
    }
    
    calendarEventsElement.innerHTML = html;
}

// Calendar navigation
if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        generateCalendar(allTasks);
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        generateCalendar(allTasks);
    });
}

// Course management UI wiring
const toggleAddCourseBtn = document.getElementById('toggleAddCourse') as HTMLButtonElement | null;
const addCourseFormEl = document.getElementById('addCourseForm') as HTMLElement | null;
const saveCourseBtn = document.getElementById('saveCourseBtn') as HTMLButtonElement | null;
const cancelCourseBtn = document.getElementById('cancelCourseBtn') as HTMLButtonElement | null;
const courseNameInput = document.getElementById('courseName') as HTMLInputElement | null;
const courseCodeInput = document.getElementById('courseCode') as HTMLInputElement | null;
const courseColorInput = document.getElementById('courseColor') as HTMLInputElement | null;

if (toggleAddCourseBtn && addCourseFormEl) {
    toggleAddCourseBtn.addEventListener('click', () => {
        const isVisible = addCourseFormEl.style.display !== 'none';
        addCourseFormEl.style.display = isVisible ? 'none' : 'block';
    });
}

if (cancelCourseBtn && addCourseFormEl) {
    cancelCourseBtn.addEventListener('click', () => {
        addCourseFormEl.style.display = 'none';
        if (courseNameInput) courseNameInput.value = '';
        if (courseCodeInput) courseCodeInput.value = '';
        if (courseColorInput) courseColorInput.value = '#667eea';
    });
}

if (saveCourseBtn) {
    saveCourseBtn.addEventListener('click', async () => {
        const name = courseNameInput?.value.trim() || '';
        if (!name) {
            showFeedback('Course name is required', 'error');
            return;
        }
        const code = courseCodeInput?.value.trim() || undefined;
        const color = courseColorInput?.value || '#667eea';
        try {
            const response = await fetch('/api/courses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, code, color }),
            });
            const result = await response.json();
            if (result.success) {
                if (addCourseFormEl) addCourseFormEl.style.display = 'none';
                if (courseNameInput) courseNameInput.value = '';
                if (courseCodeInput) courseCodeInput.value = '';
                if (courseColorInput) courseColorInput.value = '#667eea';
                showFeedback('Course created!', 'success');
                await loadCourses();
            } else {
                showFeedback(result.error || 'Failed to create course', 'error');
            }
        } catch {
            showFeedback('Error creating course', 'error');
        }
    });
}

// Load tasks on page load
loadCourses();
loadTasks();
updateTaskTypeDisplay();
