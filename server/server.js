import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {login} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});


app.post("/submit", (req, res) => {
  const { username, password } = req.body;
  const UID = login(username, password);
  if (UID === null) {
    return res.json({ success: false });
  }
 
  res.json({ success: true, user: UID });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
