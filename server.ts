import express, { json, Request, Response } from 'express';
import path from 'path';
import {deleteSession, validateSession, login, register} from './backend/auth';
import { initializeDB } from './backend/dbManager';
import { ERRORS, getStatusCode } from './backend/error/errors';
import AppError from './backend/error/appError';
import { getTasks, deleteTask, updateTaskCompletion, createTask, updateTask, toggleRecurringInstance, createCourse, getCourses, deleteCourse } from './backend/API';

const app = express();
const port = 8080;

const loginPage = path.join(__dirname, '/public/login/login.html');
const dashboardPage = path.join(__dirname, '/public/dashboard/dashboard.html');

initializeDB(); 

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '/public/')));
app.use('/dist', express.static(path.join(__dirname, 'dist')));

////////////////////////////////////////////////////////////////////////////////////////////////

// Route for the root path
app.get('/', (req, res) => {
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    validateSession(sessionID);
    res.redirect('/dashboard/'); // Redirect to dashboard if session is valid
  }
  catch (e) {
    const error = e as AppError;
    res.redirect('/login/'); // Redirect to login if there's an error (e.g., no session or invalid session)
  }
});

// Registration route
app.post("/register/", (req , res) => {
  const { username, password } = req.body;

  try {
    const UID = register(username, password);
    res.status(201).json({ success: true, user: UID, redirect: '/login/' });
  }
  catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error as AppError)).json({ success: false, error: error.message });
  }
});

// Login route
app.post("/login/", (req, res) => {
  const { username, password } = req.body;
  try {
    const SID = login(username, password);
    res.setHeader('Set-Cookie', `SID=${SID}; HttpOnly; Path=/; Max-Age=86400`); // Set cookie for 24 hours
    res.status(200).json({ success: true, redirect: '/dashboard/' });
  }  
  catch (e) {  
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// Logout route
app.get("/logout/", (req, res) => {
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    res.setHeader('Set-Cookie', `SID=; HttpOnly; Path=/; Max-Age=0`); // Clear the cookie
    deleteSession(sessionID);
    res.status(200).json({ success: true, redirect: '/' });
  } 
  catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// Login page route
app.get("/login/", (req, res) => {
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    if (validateSession(sessionID)) {
      res.redirect('/dashboard/'); // Redirect to dashboard if session is valid
    } else {
      res.sendFile(loginPage); // Otherwise, serve the login page
    }
  } catch (e) {
    res.sendFile(loginPage); // If there's an error (e.g., no session), serve the login page
  }
});

// Dashboard page route
app.get("/dashboard/", (req, res) => {
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    validateSession(sessionID);
    res.sendFile(dashboardPage);
  } catch (e) {
    const error = e as AppError;
    res.redirect('/login/'); // Redirect to login if there's an error (e.g., no session or invalid session)
  }
});

/////////////////////////////
// DASHBOARD API ENDPOINTS //
/////////////////////////////

// create task, expects { type, title, description, date, days, time, courseId? }
app.post("/api/tasks", (req, res) => {
  const { type, title, description, date, days, time, courseId } = req.body;
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);
    createTask(type, title, UID, date, days, time, description, courseId);

    res.status(201).json({ success: true });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// get tasks
app.get("/api/tasks", (req, res) => {
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);
    const tasks = getTasks(UID);
    res.status(200).json({ success: true, tasks });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// delete task
app.delete("/api/tasks/:id", (req, res) => {
  const taskId = req.params.id;
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);
    deleteTask(UID, taskId);
    res.status(200).json({ success: true });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// update task (both one-time and recurring)
app.put("/api/tasks/:id", (req, res) => {
  const taskId = req.params.id;
  const { type, title, description, date, days, time, courseId } = req.body;
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);

    updateTask(UID, taskId, type, title, description, date, days, time, courseId);
    res.status(200).json({ success: true });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// get courses
app.get("/api/courses", (req, res) => {
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);
    const courses = getCourses(UID);
    res.status(200).json({ success: true, courses });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// create course, expects { name, code?, color? }
app.post("/api/courses", (req, res) => {
  const { name, code, color } = req.body;
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);
    createCourse(name, UID, code, color);
    res.status(201).json({ success: true });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// delete course
app.delete("/api/courses/:id", (req, res) => {
  const courseId = req.params.id;
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);
    deleteCourse(UID, courseId);
    res.status(200).json({ success: true });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// toggle recurring instance completion
app.patch("/api/tasks/:id/instance", (req, res) => {
  const taskId = req.params.id;
  const { instanceDate, completed } = req.body;
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);
    if (typeof completed !== 'boolean') {
      throw new AppError('Invalid completed value', ERRORS.INVALID_TASK_DATA);
    }
    toggleRecurringInstance(UID, taskId, instanceDate, completed);
    res.status(200).json({ success: true });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

// update one-time task completion
app.patch("/api/tasks/:id", (req, res) => {
  const taskId = req.params.id;
  const { completed } = req.body;
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);

    if (typeof completed !== 'boolean') {
      throw new AppError('Invalid completed value', ERRORS.INVALID_TASK_DATA);
    }

    updateTaskCompletion(UID, taskId, completed);
    res.status(200).json({ success: true });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

function retrieveSessionID(cookieHeader = '') {
  const sessionID = Object.fromEntries(
    cookieHeader.split('; ').map(cookie => {
      const [key, value] = cookie.split('=');
      return [key, value];
    })
  ).SID;

  if (!sessionID) {
    throw new AppError('No session ID found in cookies', ERRORS.INVALID_CREDENTIALS);
  }
  return sessionID;
}

