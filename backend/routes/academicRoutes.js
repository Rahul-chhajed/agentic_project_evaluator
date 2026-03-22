const express = require('express');
const { query } = require('../db');
const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  evaluateProposal,
  generateMilestoneFeedback,
  computeSubmissionScore,
} = require('../services/agentService');

const router = express.Router();
const MILESTONE_WEIGHT = Number(process.env.MILESTONE_WEIGHT || 0.4);
const FINAL_SUBMISSION_WEIGHT = Number(process.env.FINAL_SUBMISSION_WEIGHT || 0.6);

const isMissingSubmissionLockColumn = (err) => err?.code === '42703';

const getCourseSubmissionLockStatus = async (courseId) => {
  try {
    const result = await query('SELECT submissions_locked FROM courses WHERE id = $1', [courseId]);
    if (!result.rows.length) return false;
    return Boolean(result.rows[0].submissions_locked);
  } catch (err) {
    if (isMissingSubmissionLockColumn(err)) {
      return false;
    }
    throw err;
  }
};

// -------------------------
// Teacher APIs
// -------------------------

router.post('/teacher/courses', protect, requireRole('teacher'), async (req, res) => {
  const {
    course_code,
    title,
    description,
    curriculum,
    learning_objectives,
    evaluation_criteria,
  } = req.body;

  if (!course_code || !title || !description || !curriculum || !learning_objectives || !evaluation_criteria) {
    return res.status(400).json({ error: 'All course fields are required.' });
  }

  try {
    const result = await query(
      `INSERT INTO courses (course_code, title, description, curriculum, learning_objectives, evaluation_criteria, teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        course_code,
        title,
        description,
        curriculum,
        learning_objectives,
        evaluation_criteria,
        req.user.id,
      ]
    );

    return res.status(201).json({ message: 'Course created successfully.', course: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Course code already exists.' });
    }
    console.error('Create course error:', err.message);
    return res.status(500).json({ error: 'Server error while creating course.' });
  }
});

router.get('/teacher/courses', protect, requireRole('teacher'), async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, 
              COUNT(DISTINCT e.id)::int AS enrollment_count,
              COUNT(DISTINCT p.id)::int AS project_count
       FROM courses c
       LEFT JOIN enrollments e ON e.course_id = c.id
       LEFT JOIN projects p ON p.course_id = c.id AND p.agent_status = 'approved'
       WHERE c.teacher_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    return res.json({ courses: result.rows });
  } catch (err) {
    console.error('Get teacher courses error:', err.message);
    return res.status(500).json({ error: 'Server error while loading courses.' });
  }
});

router.get('/teacher/courses/:courseId/projects', protect, requireRole('teacher'), async (req, res) => {
  const { courseId } = req.params;

  try {
    const courseCheck = await query('SELECT id FROM courses WHERE id = $1 AND teacher_id = $2', [courseId, req.user.id]);
    if (!courseCheck.rows.length) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const projectsResult = await query(
      `SELECT p.*, s.student_id, s.name AS student_name,
              COALESCE((SELECT COUNT(*) FROM submissions sub WHERE sub.project_id = p.id), 0)::int AS submission_count,
              (SELECT sc.score FROM scores sc WHERE sc.project_id = p.id AND sc.is_final = TRUE ORDER BY sc.evaluated_at DESC LIMIT 1) AS final_score
       FROM projects p
       JOIN students s ON s.id = p.student_id
       WHERE p.course_id = $1
         AND p.agent_status = 'approved'
       ORDER BY p.created_at DESC`,
      [courseId]
    );

    return res.json({ projects: projectsResult.rows });
  } catch (err) {
    console.error('Get course projects error:', err.message);
    return res.status(500).json({ error: 'Server error while loading projects.' });
  }
});

router.post('/teacher/courses/:courseId/submission-lock', protect, requireRole('teacher'), async (req, res) => {
  const { courseId } = req.params;
  const locked = req.body?.locked !== false;

  try {
    const ownership = await query('SELECT id FROM courses WHERE id = $1 AND teacher_id = $2', [courseId, req.user.id]);
    if (!ownership.rows.length) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const updated = await query(
      `UPDATE courses
       SET submissions_locked = $1
       WHERE id = $2 AND teacher_id = $3
       RETURNING id, course_code, title, submissions_locked`,
      [locked, courseId, req.user.id]
    );

    return res.json({
      message: locked ? 'Course submissions locked.' : 'Course submissions unlocked.',
      course: updated.rows[0],
    });
  } catch (err) {
    if (isMissingSubmissionLockColumn(err)) {
      return res.status(400).json({
        error: 'Database column courses.submissions_locked is missing. Add it first: ALTER TABLE courses ADD COLUMN submissions_locked BOOLEAN NOT NULL DEFAULT FALSE;',
      });
    }
    console.error('Set course submission lock error:', err.message);
    return res.status(500).json({ error: 'Server error while updating submission lock.' });
  }
});

router.get('/teacher/courses/:courseId/final-scores', protect, requireRole('teacher'), async (req, res) => {
  const { courseId } = req.params;

  try {
    const courseCheck = await query('SELECT id, course_code, title FROM courses WHERE id = $1 AND teacher_id = $2', [courseId, req.user.id]);
    if (!courseCheck.rows.length) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const result = await query(
      `SELECT s.student_id,
              s.name AS student_name,
              p.id AS project_id,
              p.title AS project_title,
              fs.score AS final_score,
              fs.feedback AS final_feedback,
              fs.evaluated_at
       FROM projects p
       JOIN students s ON s.id = p.student_id
       LEFT JOIN LATERAL (
         SELECT score, feedback, evaluated_at
         FROM scores
         WHERE project_id = p.id AND is_final = TRUE
         ORDER BY evaluated_at DESC
         LIMIT 1
       ) fs ON TRUE
       WHERE p.course_id = $1
         AND p.agent_status = 'approved'
       ORDER BY s.student_id ASC`,
      [courseId]
    );

    return res.json({
      course: courseCheck.rows[0],
      final_scores: result.rows,
    });
  } catch (err) {
    console.error('Get final score list error:', err.message);
    return res.status(500).json({ error: 'Server error while loading final scores.' });
  }
});

router.get('/teacher/projects/:projectId/submissions', protect, requireRole('teacher'), async (req, res) => {
  const { projectId } = req.params;

  try {
    const projectCheck = await query(
      `SELECT p.id
       FROM projects p
       JOIN courses c ON c.id = p.course_id
       WHERE p.id = $1 AND c.teacher_id = $2`,
      [projectId, req.user.id]
    );

    if (!projectCheck.rows.length) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const submissions = await query(
      `SELECT sub.*, sc.score, sc.feedback AS score_feedback, sc.is_final
       FROM submissions sub
       LEFT JOIN LATERAL (
         SELECT score, feedback, is_final
         FROM scores
         WHERE submission_id = sub.id
         ORDER BY evaluated_at DESC
         LIMIT 1
       ) sc ON TRUE
       WHERE sub.project_id = $1
       ORDER BY sub.submitted_at DESC`,
      [projectId]
    );

    return res.json({ submissions: submissions.rows });
  } catch (err) {
    console.error('Get submissions error:', err.message);
    return res.status(500).json({ error: 'Server error while loading submissions.' });
  }
});

router.post('/teacher/submissions/:submissionId/evaluate', protect, requireRole('teacher'), async (req, res) => {
  return res.status(410).json({
    error: 'Manual grading is disabled. Submissions are auto-graded sequentially when students submit progress/final work.',
  });
});

// -------------------------
// Student APIs
// -------------------------

router.get('/student/courses', protect, requireRole('student'), async (req, res) => {
  try {
    const available = await query(
      `SELECT c.id, c.course_code, c.title, c.description, c.created_at,
              t.name AS teacher_name,
              EXISTS (
                SELECT 1 FROM enrollments e
                WHERE e.course_id = c.id AND e.student_id = $1
              ) AS enrolled
       FROM courses c
       JOIN teachers t ON t.id = c.teacher_id
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    return res.json({ courses: available.rows });
  } catch (err) {
    console.error('Get student courses error:', err.message);
    return res.status(500).json({ error: 'Server error while loading courses.' });
  }
});

router.post('/student/enroll', protect, requireRole('student'), async (req, res) => {
  const { course_code } = req.body;
  if (!course_code) return res.status(400).json({ error: 'Course code is required.' });

  try {
    const courseRes = await query('SELECT id FROM courses WHERE course_code = $1', [course_code]);
    if (!courseRes.rows.length) {
      return res.status(404).json({ error: 'Invalid course code.' });
    }

    const courseId = courseRes.rows[0].id;

    await query(
      `INSERT INTO enrollments (student_id, course_id)
       VALUES ($1, $2)
       ON CONFLICT (student_id, course_id) DO NOTHING`,
      [req.user.id, courseId]
    );

    return res.status(201).json({ message: 'Joined course successfully.' });
  } catch (err) {
    console.error('Enroll course error:', err.message);
    return res.status(500).json({ error: 'Server error while joining course.' });
  }
});

router.get('/student/projects', protect, requireRole('student'), async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, c.course_code, c.title AS course_title,
              COALESCE((SELECT COUNT(*) FROM submissions s WHERE s.project_id = p.id), 0)::int AS submission_count,
              (SELECT sc.score FROM scores sc WHERE sc.project_id = p.id AND sc.is_final = TRUE ORDER BY sc.evaluated_at DESC LIMIT 1) AS final_score
       FROM projects p
       JOIN courses c ON c.id = p.course_id
       WHERE p.student_id = $1
         AND p.agent_status = 'approved'
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    return res.json({ projects: result.rows });
  } catch (err) {
    console.error('Get student projects error:', err.message);
    return res.status(500).json({ error: 'Server error while loading projects.' });
  }
});

router.post('/student/projects', protect, requireRole('student'), async (req, res) => {
  const { course_id, title, idea_text } = req.body;

  if (!course_id || !title || !idea_text) {
    return res.status(400).json({ error: 'Course, title, and idea text are required.' });
  }

  try {
    // Student must be enrolled before submitting a project.
    const enrollment = await query(
      'SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2',
      [req.user.id, course_id]
    );

    if (!enrollment.rows.length) {
      return res.status(403).json({ error: 'Join the course before submitting a project.' });
    }

    const courseRes = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    if (!courseRes.rows.length) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    // Allow many proposal attempts until one is approved for this student+course.
    const approvedProject = await query(
      `SELECT id
       FROM projects
       WHERE student_id = $1 AND course_id = $2 AND agent_status = 'approved'
       LIMIT 1`,
      [req.user.id, course_id]
    );

    if (approvedProject.rows.length) {
      return res.status(409).json({
        error: 'You already have an approved project for this course. New proposals are disabled after approval.',
      });
    }

    const evaluation = await evaluateProposal({
      ideaText: idea_text,
      course: courseRes.rows[0],
    });

    if (evaluation.decision !== 'approved') {
      return res.status(200).json({
        message: 'Project proposal rejected. It was not saved. Update your idea and submit again.',
        project: null,
        proposal_result: evaluation,
      });
    }

    const insert = await query(
      `INSERT INTO projects (student_id, course_id, title, idea_text, agent_status, agent_feedback)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.user.id,
        course_id,
        title,
        idea_text,
        evaluation.decision,
        `${evaluation.feedback} Scores: ${JSON.stringify(evaluation.scores)}`,
      ]
    );

    return res.status(201).json({
      message: 'Project proposal approved.',
      project: insert.rows[0],
      proposal_result: evaluation,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Database still has UNIQUE(student_id, course_id) on projects. Remove that constraint to allow multiple proposal attempts.',
      });
    }
    console.error('Create project error:', err.message);
    return res.status(500).json({ error: 'Server error while submitting project.' });
  }
});

router.get('/student/projects/:projectId/submissions', protect, requireRole('student'), async (req, res) => {
  const { projectId } = req.params;

  try {
    const ownerCheck = await query('SELECT id FROM projects WHERE id = $1 AND student_id = $2', [projectId, req.user.id]);
    if (!ownerCheck.rows.length) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const result = await query(
      `SELECT sub.*, sc.score, sc.feedback AS score_feedback, sc.is_final
       FROM submissions sub
       LEFT JOIN LATERAL (
         SELECT score, feedback, is_final
         FROM scores
         WHERE submission_id = sub.id
         ORDER BY evaluated_at DESC
         LIMIT 1
       ) sc ON TRUE
       WHERE sub.project_id = $1
       ORDER BY sub.submitted_at DESC`,
      [projectId]
    );

    return res.json({ submissions: result.rows });
  } catch (err) {
    console.error('Get project submissions error:', err.message);
    return res.status(500).json({ error: 'Server error while loading submissions.' });
  }
});

router.post('/student/projects/:projectId/submissions', protect, requireRole('student'), async (req, res) => {
  const { projectId } = req.params;
  const { milestone, progress_notes, file_paths = [], code_snippets = [], is_final = false } = req.body;

  if (!milestone || !progress_notes) {
    return res.status(400).json({ error: 'Milestone and progress notes are required.' });
  }

  try {
    const projectRes = await query(
      `SELECT p.*, c.description, c.curriculum, c.learning_objectives, c.evaluation_criteria
       FROM projects p
       JOIN courses c ON c.id = p.course_id
       WHERE p.id = $1 AND p.student_id = $2`,
      [projectId, req.user.id]
    );
    if (!projectRes.rows.length) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const project = projectRes.rows[0];

    if (project.agent_status !== 'approved') {
      return res.status(403).json({ error: 'You can submit milestones only after proposal approval.' });
    }

    const courseLocked = await getCourseSubmissionLockStatus(project.course_id);
    if (courseLocked) {
      return res.status(403).json({ error: 'Submissions are locked by teacher for this course.' });
    }

    const existingFinal = await query(
      `SELECT id
       FROM scores
       WHERE project_id = $1 AND is_final = TRUE
       LIMIT 1`,
      [projectId]
    );

    if (existingFinal.rows.length) {
      return res.status(409).json({
        error: 'Final submission is already evaluated for this project. New submissions are locked.',
      });
    }

    const previousSubmissions = await query(
      'SELECT id, milestone, progress_notes FROM submissions WHERE project_id = $1 ORDER BY submitted_at ASC',
      [projectId]
    );

    const mentorFeedback = await generateMilestoneFeedback({
      submission: { milestone, progress_notes },
      previousSubmissions: previousSubmissions.rows,
      project,
      course: {
        description: project.description,
        curriculum: project.curriculum,
        learning_objectives: project.learning_objectives,
      },
      codeSnippets: code_snippets,
    });

    // Store mentor feedback and attached file names for MVP readability.
    const attachedFilesText = Array.isArray(file_paths) && file_paths.length
      ? `\n\n[Attached Files]\n${file_paths.join(', ')}`
      : '';
    const enrichedNotes = `${progress_notes}${attachedFilesText}\n\n[Mentor Feedback]\n${mentorFeedback}`;

    const inserted = await query(
      `INSERT INTO submissions (project_id, milestone, progress_notes, file_paths)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [projectId, milestone, enrichedNotes, file_paths]
    );

    const previousEvaluationsRes = await query(
      `SELECT sub.milestone, sc.score, sc.feedback, sc.is_final, sc.evaluated_at
       FROM scores sc
       JOIN submissions sub ON sub.id = sc.submission_id
       WHERE sc.project_id = $1
       ORDER BY sc.evaluated_at ASC`,
      [projectId]
    );

    const scoreResult = await computeSubmissionScore({
      submission: {
        ...inserted.rows[0],
        progress_notes,
      },
      project,
      course: {
        evaluation_criteria: project.evaluation_criteria,
        learning_objectives: project.learning_objectives,
      },
      previousEvaluations: previousEvaluationsRes.rows,
      isFinal: Boolean(is_final),
      codeSnippets: code_snippets,
    });

    let finalScoreToStore = scoreResult.score;
    let feedbackToStore = scoreResult.feedback;
    let scoreType = 'milestone';

    if (is_final) {
      const milestoneAvgRes = await query(
        `SELECT AVG(score)::numeric(10,2) AS milestone_avg
         FROM scores
         WHERE project_id = $1 AND is_final = FALSE`,
        [projectId]
      );

      const milestoneAvg = milestoneAvgRes.rows[0]?.milestone_avg !== null
        ? Number(milestoneAvgRes.rows[0].milestone_avg)
        : null;

      if (milestoneAvg !== null) {
        finalScoreToStore = Number(
          (milestoneAvg * MILESTONE_WEIGHT + scoreResult.score * FINAL_SUBMISSION_WEIGHT).toFixed(2)
        );
        feedbackToStore = [
          `Weighted final score generated automatically.`,
          `Milestone average (${Math.round(MILESTONE_WEIGHT * 100)}%): ${milestoneAvg.toFixed(2)}`,
          `Final submission score (${Math.round(FINAL_SUBMISSION_WEIGHT * 100)}%): ${scoreResult.score.toFixed(2)}`,
          `Combined final score: ${finalScoreToStore.toFixed(2)}`,
          '',
          '[LLM Final Feedback]',
          scoreResult.feedback,
        ].join('\n');
      }

      scoreType = 'final';
    }

    await query(
      `INSERT INTO scores (submission_id, project_id, score, feedback, is_final)
       VALUES ($1, $2, $3, $4, $5)`,
      [inserted.rows[0].id, projectId, finalScoreToStore, feedbackToStore, Boolean(is_final)]
    );

    return res.status(201).json({
      message: is_final
        ? 'Final submission recorded and weighted final score generated automatically.'
        : 'Milestone submitted and auto-graded successfully.',
      submission: inserted.rows[0],
      mentor_feedback: mentorFeedback,
      grading: {
        type: scoreType,
        score: finalScoreToStore,
        evidence: scoreResult.evidence || null,
      },
    });
  } catch (err) {
    console.error('Submit milestone error:', err.message);
    return res.status(500).json({ error: 'Server error while submitting milestone.' });
  }
});

router.get('/student/projects/:projectId/score-summary', protect, requireRole('student'), async (req, res) => {
  const { projectId } = req.params;

  try {
    const ownerCheck = await query('SELECT id FROM projects WHERE id = $1 AND student_id = $2', [projectId, req.user.id]);
    if (!ownerCheck.rows.length) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const scores = await query(
      `SELECT score, feedback, is_final, evaluated_at
       FROM scores
       WHERE project_id = $1
       ORDER BY evaluated_at DESC`,
      [projectId]
    );

    const milestoneAvgRes = await query(
      `SELECT AVG(score)::numeric(10,2) AS milestone_avg
       FROM scores
       WHERE project_id = $1 AND is_final = FALSE`,
      [projectId]
    );

    const finalScoreRes = await query(
      `SELECT score, evaluated_at
       FROM scores
       WHERE project_id = $1 AND is_final = TRUE
       ORDER BY evaluated_at DESC
       LIMIT 1`,
      [projectId]
    );

    return res.json({
      scores: scores.rows,
      summary: {
        milestone_avg: milestoneAvgRes.rows[0]?.milestone_avg,
        final_score: finalScoreRes.rows[0]?.score || null,
        final_evaluated_at: finalScoreRes.rows[0]?.evaluated_at || null,
      },
    });
  } catch (err) {
    console.error('Score summary error:', err.message);
    return res.status(500).json({ error: 'Server error while loading score summary.' });
  }
});

module.exports = router;
