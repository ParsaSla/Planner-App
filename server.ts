import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import {invalidateSession, validateSession, login, register} from './backend/auth';
import { initializeDB } from './backend/db/connection';
import { ERRORS, getStatusCode } from './backend/error/errors';
import AppError from './backend/error/appError';
import { createItem, updateItem, deleteItem, getItems, getItemOccurrences, setOneTimeCompletion, setOccurrenceCompletion, createCourse, getCourses, deleteCourse, getSettings, saveSettings, previewICalImport, commitICalImport, addIcal, removeIcal, updateIcal, getIcal, getIcals, refreshIcal } from './backend/API';

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
  invalidateSession(sessionID);
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
// ITEM API ENDPOINTS       //
/////////////////////////////

// create item, expects
// { courseId?, recurrence, title, description?, location?, date?, start_date?, end_date?,
//   frequency?, daysOfWeek?, start_time?, end_time?, timezone? }
app.post("/api/items", (req, res) => {
  const { courseId, recurrence, title, description, location, date, start_date, end_date, frequency, daysOfWeek, start_time, end_time, timezone } = req.body;
  const UID = authenticate(req);
  createItem(UID, courseId, recurrence, title, description, location, date, start_date, end_date, frequency, daysOfWeek, start_time, end_time, timezone);
  res.status(201).json({ success: true });
});

// get raw source items — used by list/smart views and to prefill the edit form.
app.get("/api/items", (req, res) => {
  const UID = authenticate(req);
  const items = getItems(UID);
  res.status(200).json({ success: true, items });
});

// get concrete occurrences over a window, expects ?from=<ISO>&to=<ISO>.
// One-time items in the window plus expanded recurring occurrences, merged and sorted.
app.get("/api/items/occurrences", (req, res) => {
  const UID = authenticate(req);
  const { from, to } = req.query;
  if (typeof from !== 'string' || typeof to !== 'string') {
    throw new AppError('`from` and `to` query parameters are required', ERRORS.INVALID_ITEM_DATA);
  }
  const items = getItemOccurrences(UID, from, to);
  res.status(200).json({ success: true, items });
});

// update item (both one-time and recurring), same body shape as create
app.put("/api/items/:id", (req, res) => {
  const { courseId, recurrence, title, description, location, date, start_date, end_date, frequency, daysOfWeek, start_time, end_time, timezone } = req.body;
  const UID = authenticate(req);
  updateItem(Number(req.params.id), UID, courseId, recurrence, title, description, location, date, start_date, end_date, frequency, daysOfWeek, start_time, end_time, timezone);
  res.status(200).json({ success: true });
});

// delete item
app.delete("/api/items/:id", (req, res) => {
  const UID = authenticate(req);
  deleteItem(UID, Number(req.params.id));
  res.status(200).json({ success: true });
});

// toggle completion, expects { completed: boolean, start?: <ISO> }.
// `start` (an occurrence's absolute UTC start instant) is required for RECURRING items and must
// be omitted for ONE_TIME items; each path validates the item's recurrence and fails loudly.
app.patch("/api/items/:id/completion", (req, res) => {
  const UID = authenticate(req);
  const { completed, start } = req.body;
  if (typeof completed !== 'boolean') {
    throw new AppError('`completed` must be a boolean', ERRORS.INVALID_ITEM_DATA);
  }
  const id = Number(req.params.id);
  if (typeof start === 'string') {
    setOccurrenceCompletion(UID, id, start, completed);
  } else if (start === undefined) {
    setOneTimeCompletion(UID, id, completed);
  } else {
    throw new AppError('`start` must be an ISO string when provided', ERRORS.INVALID_ITEM_DATA);
  }
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
  const UID = authenticate(req);
  deleteCourse(UID, Number(req.params.id));
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

// add new ical route
app.post("/api/ical/", (req, res) => {
  const { url } = req.body;
  const UID = authenticate(req);
  addIcal(UID, url);
  res.status(200).json({ success: true, message: `iCal import initiated for URL: ${url}` });
});

app.delete("/api/ical/:icalId", (req, res) => {
  const UID = authenticate(req);
  const icalId = Number(req.params.icalId);
  removeIcal(UID, icalId);
  res.status(200).json({ success: true, message: `iCal subscription with ID ${icalId} deleted.` });
});

app.put("/api/ical/:icalId", (req, res) => {
  const UID = authenticate(req);
  const icalId = Number(req.params.icalId);
  const updates = req.body; // Expecting { url?: string; active?: number }
  updateIcal(UID, icalId, updates);
  res.status(200).json({ success: true, message: `iCal subscription with ID ${icalId} updated.` });
});

app.get("/api/ical/:icalId", (req, res) => {
  const UID = authenticate(req);
  const icalId = Number(req.params.icalId);
  const icalRow = getIcal(UID, icalId);
  res.status(200).json({ success: true, ical: icalRow });
});

// re-pull a saved subscription and sync its events (no review step); bumps last_imported.
app.post("/api/ical/:icalId/refresh", async (req, res) => {
  const UID = authenticate(req);
  const icalId = Number(req.params.icalId);
  const result = await refreshIcal(UID, icalId);
  res.status(200).json({ success: true, result });
});

app.get("/api/ical", (req, res) => {
  const UID = authenticate(req);
  const icals = getIcals(UID);
  res.status(200).json({ success: true, icals });
});

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
