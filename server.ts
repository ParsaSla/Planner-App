import 'dotenv/config';
import { createApp } from './app';
import { initializeDB } from './backend/db/connection';

initializeDB();
const port = 8080;
createApp().listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
