const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db.js');

const router = express.Router();

// ─────────────────────────────────────────
//  TEACHER SIGNUP  POST /auth/teacher/signup
// ─────────────────────────────────────────
router.post('/teacher/signup', async (req, res) => {
  const { teacher_id, name, email, password } = req.body;

  // Basic validation
  if (!teacher_id || !name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    // Check if teacher_id or email already exists
    const existing = await query(
      'SELECT id FROM teachers WHERE teacher_id = $1 OR email = $2',
      [teacher_id, email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Teacher ID or email already registered.' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert into DB
    const result = await query(
      `INSERT INTO teachers (teacher_id, name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, teacher_id, name, email`,
      [teacher_id, name, email, password_hash]
    );

    const teacher = result.rows[0];

    // Sign JWT
    const token = jwt.sign(
      { id: teacher.id, role: 'teacher' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Teacher registered successfully.',
      token,
      user: { id: teacher.id, teacher_id: teacher.teacher_id, name: teacher.name, email: teacher.email, role: 'teacher' },
    });
  } catch (err) {
    console.error('Teacher signup error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────
//  TEACHER LOGIN   POST /auth/teacher/login
// ─────────────────────────────────────────
router.post('/teacher/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await query('SELECT * FROM teachers WHERE email = $1', [email]);
    const teacher = result.rows[0];

    if (!teacher) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, teacher.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: teacher.id, role: 'teacher' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful.',
      token,
      user: { id: teacher.id, teacher_id: teacher.teacher_id, name: teacher.name, email: teacher.email, role: 'teacher' },
    });
  } catch (err) {
    console.error('Teacher login error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────
//  STUDENT LOGIN   POST /auth/student/login
// ─────────────────────────────────────────
router.post('/student/login', async (req, res) => {
  const { student_id, password } = req.body;

  if (!student_id || !password) {
    return res.status(400).json({ error: 'Student ID and password are required.' });
  }

  try {
    const result = await query('SELECT * FROM students WHERE student_id = $1', [student_id]);
    const student = result.rows[0];

    if (!student) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, student.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: student.id, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful.',
      token,
      user: { id: student.id, student_id: student.student_id, name: student.name, role: 'student' },
    });
  } catch (err) {
    console.error('Student login error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────
//  STUDENT SIGNUP  POST /auth/student/signup
// ─────────────────────────────────────────
router.post('/student/signup', async (req, res) => {
  const { student_id, name, email, password } = req.body;

  if (!student_id || !name || !password) {
    return res.status(400).json({ error: 'Student ID, name, and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const existing = await query(
      'SELECT id FROM students WHERE student_id = $1',
      [student_id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Student ID already registered.' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO students (student_id, name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, student_id, name, email`,
      [student_id, name, email || null, password_hash]
    );

    const student = result.rows[0];

    const token = jwt.sign(
      { id: student.id, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Student registered successfully.',
      token,
      user: { id: student.id, student_id: student.student_id, name: student.name, role: 'student' },
    });
  } catch (err) {
    console.error('Student signup error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;