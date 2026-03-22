import { useEffect, useState } from 'react';
import api from '../api';
import LayoutShell from './LayoutShell';

const TeacherDashboard = () => {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [finalScores, setFinalScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lockingCourseId, setLockingCourseId] = useState(null);

  const [form, setForm] = useState({
    course_code: '',
    title: '',
    description: '',
    curriculum: '',
    learning_objectives: '',
    evaluation_criteria: '',
  });

  const cardClass = 'bg-white border border-gray-200 rounded-2xl p-5 shadow-sm';
  const inputClass = 'w-full bg-[#f8f8f8] border border-gray-200 focus:border-[#c3f832] focus:ring-2 focus:ring-[#c3f832]/30 rounded-xl px-4 py-2.5 text-gray-800 placeholder-gray-400 outline-none transition-all';

  const loadCourses = async () => {
    setError('');
    try {
      const res = await api.get('/api/teacher/courses');
      setCourses(res.data.courses || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load courses.');
    }
  };

  const loadProjects = async (courseId) => {
    setError('');
    if (!courseId) return;

    try {
      const res = await api.get(`/api/teacher/courses/${courseId}/projects`);
      setProjects(res.data.projects || []);
      setSelectedProjectId('');
      setSubmissions([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load projects.');
    }
  };

  const loadFinalScores = async (courseId) => {
    setError('');
    if (!courseId) return;

    try {
      const res = await api.get(`/api/teacher/courses/${courseId}/final-scores`);
      setFinalScores(res.data.final_scores || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load final scores.');
    }
  };

  const loadProjectSubmissions = async (projectId) => {
    setError('');
    if (!projectId) return;

    try {
      const res = await api.get(`/api/teacher/projects/${projectId}/submissions`);
      setSubmissions(res.data.submissions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load submissions.');
    }
  };

  const handleLockCourseSubmissions = async () => {
    if (!selectedCourseId) return;
    setError('');
    setMessage('');
    setLockingCourseId(selectedCourseId);

    try {
      const res = await api.post(`/api/teacher/courses/${selectedCourseId}/submission-lock`, { locked: true });
      setMessage(res.data.message || 'Course submissions locked.');
      await loadCourses();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to lock submissions for course.');
    } finally {
      setLockingCourseId(null);
    }
  };

  const selectedCourse = courses.find((course) => String(course.id) === String(selectedCourseId));

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      loadProjects(selectedCourseId);
      loadFinalScores(selectedCourseId);
    }
  }, [selectedCourseId]);

  useEffect(() => {
    if (selectedProjectId) loadProjectSubmissions(selectedProjectId);
  }, [selectedProjectId]);

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await api.post('/api/teacher/courses', form);
      setMessage('Course created successfully.');
      setForm({
        course_code: '',
        title: '',
        description: '',
        curriculum: '',
        learning_objectives: '',
        evaluation_criteria: '',
      });
      loadCourses();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create course.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LayoutShell
      title="Teacher Dashboard"
      subtitle="Create courses, review auto-evaluated submissions, and view final score list per course."
    >
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>}
      {message && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">{message}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className={`${cardClass} xl:col-span-2`}>
          <h2 className="text-lg font-semibold text-[#292928] mb-4">Create New Course</h2>
          <form onSubmit={handleCreateCourse} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className={inputClass} placeholder="Course Code (e.g. CS301-2026)" value={form.course_code} onChange={(e) => setForm((prev) => ({ ...prev, course_code: e.target.value }))} required />
            <input className={inputClass} placeholder="Course Title" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
            <textarea className={`${inputClass} md:col-span-2 min-h-20`} placeholder="Course Description" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} required />
            <textarea className={`${inputClass} md:col-span-2 min-h-20`} placeholder="Curriculum / Syllabus Topics" value={form.curriculum} onChange={(e) => setForm((prev) => ({ ...prev, curriculum: e.target.value }))} required />
            <textarea className={`${inputClass} md:col-span-2 min-h-20`} placeholder="Learning Objectives" value={form.learning_objectives} onChange={(e) => setForm((prev) => ({ ...prev, learning_objectives: e.target.value }))} required />
            <textarea className={`${inputClass} md:col-span-2 min-h-20`} placeholder="Evaluation Criteria / Rubric" value={form.evaluation_criteria} onChange={(e) => setForm((prev) => ({ ...prev, evaluation_criteria: e.target.value }))} required />

            <button
              type="submit"
              disabled={loading}
              className="md:col-span-2 bg-[#292928] hover:bg-black disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-all"
            >
              {loading ? 'Creating...' : 'Create Course'}
            </button>
          </form>
        </section>

        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-[#292928] mb-3">Your Courses</h2>
          {!!selectedCourseId && (
            <button
              onClick={handleLockCourseSubmissions}
              disabled={lockingCourseId === selectedCourseId || Boolean(selectedCourse?.submissions_locked)}
              className="mb-3 w-full px-3 py-2 rounded-lg bg-[#292928] disabled:opacity-60 text-white text-xs font-semibold hover:bg-black"
            >
              {Boolean(selectedCourse?.submissions_locked)
                ? 'Submissions Already Locked'
                : lockingCourseId === selectedCourseId
                  ? 'Locking Submissions...'
                  : 'Lock Submissions For Selected Course'}
            </button>
          )}
          <div className="space-y-2 max-h-96 overflow-auto pr-1">
            {courses.map((course) => (
              <button
                key={course.id}
                onClick={() => setSelectedCourseId(String(course.id))}
                className={`w-full text-left rounded-xl border px-3 py-2 transition-all ${String(course.id) === selectedCourseId ? 'border-[#c3f832] bg-[#fbffe6]' : 'border-gray-200 bg-[#fafafa] hover:bg-white'}`}
              >
                <p className="font-semibold text-[#292928] text-sm">{course.course_code}</p>
                <p className="text-xs text-gray-600">{course.title}</p>
                <p className="text-xs text-gray-500 mt-1">{course.enrollment_count} enrolled • {course.project_count} projects</p>
                {!!course.submissions_locked && (
                  <p className="text-[11px] text-amber-700 mt-1 font-semibold">Submission Locked</p>
                )}
              </button>
            ))}
            {!courses.length && <p className="text-sm text-gray-500">No courses yet.</p>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-5">
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-[#292928] mb-3">Projects in Selected Course</h2>
          <div className="space-y-2 max-h-96 overflow-auto pr-1">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(String(project.id))}
                className={`w-full text-left rounded-xl border px-3 py-2 transition-all ${String(project.id) === selectedProjectId ? 'border-[#c3f832] bg-[#fbffe6]' : 'border-gray-200 bg-[#fafafa] hover:bg-white'}`}
              >
                <p className="font-semibold text-[#292928] text-sm">{project.title}</p>
                <p className="text-xs text-gray-600">{project.student_name} ({project.student_id})</p>
                <p className="text-xs text-gray-500 mt-1">Status: {project.agent_status} • Submissions: {project.submission_count}</p>
              </button>
            ))}
            {!projects.length && <p className="text-sm text-gray-500">Select a course to see projects.</p>}
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-[#292928] mb-3">Submissions and Auto-Evaluation</h2>
          <div className="space-y-3 max-h-96 overflow-auto pr-1">
            {submissions.map((item) => (
              <article key={item.id} className="border border-gray-200 rounded-xl p-3 bg-[#fafafa]">
                <p className="font-semibold text-sm text-[#292928]">{item.milestone}</p>
                <p className="text-xs text-gray-500 mt-1">{new Date(item.submitted_at).toLocaleString()}</p>
                {!!item.file_paths?.length && (
                  <p className="text-xs text-gray-500 mt-1">Files: {item.file_paths.join(', ')}</p>
                )}
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-line line-clamp-5">{item.progress_notes}</p>

                {item.score !== null && item.score !== undefined && (
                  <p className="text-xs text-gray-700 mt-2">
                    Latest score: <span className="font-semibold">{item.score}</span> {item.is_final ? '(Final)' : '(Milestone)'}
                  </p>
                )}
              </article>
            ))}
            {!submissions.length && <p className="text-sm text-gray-500">Select a project to see submissions.</p>}
          </div>
        </section>
      </div>

      <section className={`${cardClass} mt-5`}>
        <h2 className="text-lg font-semibold text-[#292928] mb-3">Final Score List (Selected Course)</h2>
        <div className="overflow-auto">
          <table className="min-w-full border border-gray-200 rounded-xl overflow-hidden text-sm">
            <thead className="bg-[#f8f8f8]">
              <tr>
                <th className="text-left px-3 py-2 border-b border-gray-200">Student ID</th>
                <th className="text-left px-3 py-2 border-b border-gray-200">Student Name</th>
                <th className="text-left px-3 py-2 border-b border-gray-200">Project</th>
                <th className="text-left px-3 py-2 border-b border-gray-200">Final Score</th>
                <th className="text-left px-3 py-2 border-b border-gray-200">Evaluated At</th>
              </tr>
            </thead>
            <tbody>
              {finalScores.map((row) => (
                <tr key={`${row.project_id}-${row.student_id}`} className="odd:bg-white even:bg-[#fafafa]">
                  <td className="px-3 py-2 border-b border-gray-100">{row.student_id}</td>
                  <td className="px-3 py-2 border-b border-gray-100">{row.student_name}</td>
                  <td className="px-3 py-2 border-b border-gray-100">{row.project_title}</td>
                  <td className="px-3 py-2 border-b border-gray-100 font-semibold">{row.final_score ?? 'Pending'}</td>
                  <td className="px-3 py-2 border-b border-gray-100">{row.evaluated_at ? new Date(row.evaluated_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
              {!finalScores.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-gray-500">Select a course to view final scores.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </LayoutShell>
  );
};

export default TeacherDashboard;
