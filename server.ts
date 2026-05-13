import express from 'express';
import path from 'path';
import {login, register} from './backend/auth';

const app = express();
const port = 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '/public/')));
app.use('/dist', express.static(path.join(__dirname, 'dist')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/login/login.html'));
});


app.post("/register", (req , res) => {
  const { username, password } = req.body;
  const UID = register(username, password);
  if (UID === null) {
    return res.json({ success: false });
  }
 
  res.json({ success: true, user: UID });
});

app.post("/login", (req, res) => {
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
