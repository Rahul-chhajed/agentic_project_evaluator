const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes.js');
const academicRoutes = require('./routes/academicRoutes.js');

const app = express();

app.use(cors({
  origin: 'http://localhost:5173', // Vite dev server
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/auth', authRoutes);
app.use('/api', academicRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(5000, () => {
  console.log('Server listening on port 5000');
});
