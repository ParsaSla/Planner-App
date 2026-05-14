import express, { json, Request, Response } from 'express';
import path from 'path';
import {deleteSession, validateSession, login, register} from './backend/auth';
import { initializeDB } from './backend/dbManager';
import { ERRORS, getStatusCode } from './backend/error/errors';
import AppError from './backend/error/appError';
import { createTask, getTasks, deleteTask } from './backend/dashboard';

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

app.post("/api/tasks", (req, res) => {
  const { title, description } = req.body;
  try {
    const sessionID = retrieveSessionID(req.headers.cookie);
    const UID = validateSession(sessionID);
    createTask(title, UID, description);
    res.status(200).json({ success: true });
  } catch (e) {
    const error = e as AppError;
    res.status(getStatusCode(error)).json({ success: false, error: error.message });
  }
});

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

