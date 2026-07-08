import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import {deleteSession, validateSession, login, register} from './backend/auth';
import { initializeDB } from './backend/dbManager';
import { ERRORS, getStatusCode } from './backend/error/errors';
import AppError from './backend/error/appError';
import { getTasks, deleteTask, updateTaskCompletion, createTask, updateTask, toggleRecurringInstance, createCourse, getCourses, deleteCourse, createEvent, getEvents, deleteEvent, updateEvent, updateEventCompletion, toggleRecurringEventInstance, getSettings, saveSettings, previewICalImport, commitICalImport } from './backend/API';

const app = express();
const port = 8080;

const loginPage = path.join(__dirname, '/public/login/login.html');
// The dashboard is now the React (Vite) build output in dist/frontend.
const dashboardPage = path.join(__dirname, '/dist/frontend/index.html');

initializeDB();

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '/public/')));
app.use('/dist', express.static(path.join(__dirname, 'dist')));
// Serve the React dashboard's built assets (JS/CSS under /assets, etc.).
// `index: false` so it never hijacks the auth-gated routes below.
app.use(express.static(path.join(__dirname, '/dist/frontend/'), { index: false }));

////////////////////////////////////////////////////////////////////////////////////////////////

// Resolve the session from the request cookie and return the authenticated user's ID.
// Throws an AppError if the session is missing or invalid.
function authenticate(req: Request): string {
  return validateSession(retrieveSessionID(req.headers.cookie));
}

// Route for the root path
app.get('/', (req, res) => {
  try {
    authenticate(req);
    res.redirect('/dashboard/'); // Redirect to dashboard if session is valid
  } catch (e) {
    res.redirect('/login/'); // Redirect to login if there's an error (e.g., no session or invalid session)
  }
});

// Registration route
app.post("/register/", (req, res) => {
  const { username, password } = req.body;
  const UID = register(username, password);
  res.status(201).json({ success: true, user: UID, redirect: '/login/' });
});

// Login route
app.post("/login/", (req, res) => {
  const { username, password } = req.body;
  const SID = login(username, password);
  res.setHeader('Set-Cookie', `SID=${SID}; HttpOnly; Path=/; Max-Age=86400`); // Set cookie for 24 hours
  res.status(200).json({ success: true, redirect: '/dashboard/' });
});

// Logout route
app.get("/logout/", (req, res) => {
  const sessionID = retrieveSessionID(req.headers.cookie);
  res.setHeader('Set-Cookie', `SID=; HttpOnly; Path=/; Max-Age=0`); // Clear the cookie
  deleteSession(sessionID);
  res.status(200).json({ success: true, redirect: '/' });
});

// Login page route
app.get("/login/", (req, res) => {
  try {
    if (authenticate(req)) {
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
    authenticate(req);
    res.sendFile(dashboardPage);
  } catch (e) {
    res.redirect('/login/'); // Redirect to login if there's an error (e.g., no session or invalid session)
  }
});

/////////////////////////////
// DASHBOARD API ENDPOINTS //
/////////////////////////////

// create task, expects { type, title, description, date, days, time, courseId? }
app.post("/api/tasks", (req, res) => {
  const { type, title, description, date, days, time, courseId } = req.body;
  const UID = authenticate(req);
  createTask(type, title, UID, date, days, time, description, courseId);
  res.status(201).json({ success: true });
});

// get tasks
app.get("/api/tasks", (req, res) => {
  const UID = authenticate(req);
  const tasks = getTasks(UID);
  res.status(200).json({ success: true, tasks });
});

// delete task
app.delete("/api/tasks/:id", (req, res) => {
  const taskId = req.params.id;
  const UID = authenticate(req);
  deleteTask(UID, taskId);
  res.status(200).json({ success: true });
});

// update task (both one-time and recurring)
app.put("/api/tasks/:id", (req, res) => {
  const taskId = req.params.id;
  const { type, title, description, date, days, time, courseId } = req.body;
  const UID = authenticate(req);
  updateTask(UID, taskId, type, title, description, date, days, time, courseId);
  res.status(200).json({ success: true });
});

// get courses
app.get("/api/courses", (req, res) => {
  const UID = authenticate(req);
  const courses = getCourses(UID);
  res.status(200).json({ success: true, courses });
});

// create course, expects { name, code?, color? }
app.post("/api/courses", (req, res) => {
  const { name, code, color } = req.body;
  const UID = authenticate(req);
  createCourse(name, UID, code, color);
  res.status(201).json({ success: true });
});

// delete course
app.delete("/api/courses/:id", (req, res) => {
  const courseId = req.params.id;
  const UID = authenticate(req);
  deleteCourse(UID, courseId);
  res.status(200).json({ success: true });
});

// toggle recurring instance completion
app.patch("/api/tasks/:id/instance", (req, res) => {
  const taskId = req.params.id;
  const { instanceDate, completed } = req.body;
  const UID = authenticate(req);
  if (typeof completed !== 'boolean') {
    throw new AppError('Invalid completed value', ERRORS.INVALID_TASK_DATA);
  }
  toggleRecurringInstance(UID, taskId, instanceDate, completed);
  res.status(200).json({ success: true });
});

// update one-time task completion
app.patch("/api/tasks/:id", (req, res) => {
  const taskId = req.params.id;
  const { completed } = req.body;
  const UID = authenticate(req);
  if (typeof completed !== 'boolean') {
    throw new AppError('Invalid completed value', ERRORS.INVALID_TASK_DATA);
  }
  updateTaskCompletion(UID, taskId, completed);
  res.status(200).json({ success: true });
});

/////////////////////////////
// EVENT API ENDPOINTS      //
/////////////////////////////

// create event, expects { type, title, description, start, end, days, startTime, endTime, courseId? }
app.post("/api/events", (req, res) => {
  const { type, title, description, start, end, days, startTime, endTime, courseId } = req.body;
  const UID = authenticate(req);
  createEvent(type, title, UID, start, end, days, startTime, endTime, description, courseId);
  res.status(201).json({ success: true });
});

// get events
app.get("/api/events", (req, res) => {
  const UID = authenticate(req);
  const events = getEvents(UID);
  res.status(200).json({ success: true, events });
});

// delete event
app.delete("/api/events/:id", (req, res) => {
  const eventId = req.params.id;
  const UID = authenticate(req);
  deleteEvent(UID, eventId);
  res.status(200).json({ success: true });
});

// update event (both one-time and recurring)
app.put("/api/events/:id", (req, res) => {
  const eventId = req.params.id;
  const { type, title, description, start, end, days, startTime, endTime, courseId } = req.body;
  const UID = authenticate(req);
  updateEvent(UID, eventId, type, title, description, start, end, days, startTime, endTime, courseId);
  res.status(200).json({ success: true });
});

// toggle recurring event instance completion
app.patch("/api/events/:id/instance", (req, res) => {
  const eventId = req.params.id;
  const { instanceDate, completed } = req.body;
  const UID = authenticate(req);
  if (typeof completed !== 'boolean') {
    throw new AppError('Invalid completed value', ERRORS.INVALID_EVENT_DATA);
  }
  toggleRecurringEventInstance(UID, eventId, instanceDate, completed);
  res.status(200).json({ success: true });
});

// update one-time event completion
app.patch("/api/events/:id", (req, res) => {
  const eventId = req.params.id;
  const { completed } = req.body;
  const UID = authenticate(req);
  if (typeof completed !== 'boolean') {
    throw new AppError('Invalid completed value', ERRORS.INVALID_EVENT_DATA);
  }
  updateEventCompletion(UID, eventId, completed);
  res.status(200).json({ success: true });
});

/////////////////////////////
// SETTINGS API ENDPOINTS   //
/////////////////////////////

// get settings
app.get("/api/settings", (req, res) => {
  const UID = authenticate(req);
  const settings = getSettings(UID);
  res.status(200).json({ success: true, settings });
});

// save settings, expects { university: { termSystem, termDates, flexWeek } }
app.put("/api/settings", (req, res) => {
  const { university } = req.body;
  const UID = authenticate(req);
  saveSettings(UID, university);
  res.status(200).json({ success: true });
});

/////////////////////////////
// ICAL IMPORT ENDPOINTS    //
/////////////////////////////

// preview an iCal import — fetch + parse + detect courses, persisting nothing.
// expects { url }
app.post("/api/ical/preview", async (req, res) => {
  const { url } = req.body;
  const UID = authenticate(req);
  const preview = await previewICalImport(UID, url);
  res.status(200).json({ success: true, preview });
});

// commit a confirmed iCal import, expects { url, courseDecisions, events }
app.post("/api/ical/import", (req, res) => {
  const { url, courseDecisions, events } = req.body;
  const UID = authenticate(req);
  const result = commitICalImport(UID, url, courseDecisions, events);
  res.status(200).json({ success: true, result });
});

// Centralized error handler — any error thrown by the route handlers above
// (auth failures, validation errors, etc.) lands here and is rendered as a
// standard JSON error response. Express 5 forwards both synchronous throws
// and rejected promises to this middleware automatically.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const error = err as AppError;
  res.status(getStatusCode(error)).json({ success: false, error: error.message });
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
