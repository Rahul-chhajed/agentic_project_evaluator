import { useEffect, useMemo, useState, useCallback } from 'react';
import api from '../api';
import LayoutShell from './LayoutShell';

const MAX_FILES = 4;
const MAX_CHARS_PER_FILE = 2000;
const MAX_TOTAL_SNIPPET_CHARS = 5000;

const StudentDashboard = () => {
  const [courses, setCourses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [scores, setScores] = useState([]);
  const [scoreSummary, setScoreSummary] = useState({ milestone_avg: null, final_score: null, final_evaluated_at: null });

  const [joinCode, setJoinCode] = useState('');
  const [proposalForm, setProposalForm] = useState({ course_id: '', title: '', idea_text: '' });
  const [submissionForm, setSubmissionForm] = useState({ milestone: '', progress_notes: '', is_final: false });
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [feedbackModal, setFeedbackModal] = useState(null); // { score, feedback, is_final, evaluated_at }

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fileNotice, setFileNotice] = useState('');

  const cardClass = 'bg-white border border-gray-200 rounded-2xl p-5 shadow-sm';
  const inputClass = 'w-full bg-[#f8f8f8] border border-gray-200 focus:border-[#c3f832] focus:ring-2 focus:ring-[#c3f832]/30 rounded-xl px-4 py-2.5 text-gray-800 placeholder-gray-400 outline-none transition-all';

  const approvedProjects = useMemo(
    () => projects.filter((project) => project.agent_status === 'approved'),
    [projects]
  );

  const approvedCourseIds = useMemo(
    () => new Set(approvedProjects.map((project) => Number(project.course_id))),
    [approvedProjects]
  );

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === String(selectedProjectId)) || null,
    [projects, selectedProjectId]
  );

  const courseLockMap = useMemo(() => {
    const map = new Map();
    courses.forEach((course) => {
      map.set(Number(course.id), Boolean(course.submissions_locked));
    });
    return map;
  }, [courses]);

  const isSelectedProjectFinalized = selectedProject?.final_score !== null && selectedProject?.final_score !== undefined;
  const isCourseLockedForNewProposal = proposalForm.course_id && approvedCourseIds.has(Number(proposalForm.course_id));
  const isSelectedCourseSubmissionLocked = selectedProject ? Boolean(courseLockMap.get(Number(selectedProject.course_id))) : false;

  const loadCourses = async () => {
    try {
      const res = await api.get('/api/student/courses');
      setCourses(res.data.courses || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load courses.');
    }
  };

  const loadProjects = async () => {
    try {
      const res = await api.get('/api/student/projects');
      const fetchedProjects = res.data.projects || [];
      setProjects(fetchedProjects);
      if (!selectedProjectId && fetchedProjects.length) {
        setSelectedProjectId(String(fetchedProjects[0].id));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load projects.');
    }
  };

  const loadSelectedProjectData = async (projectId) => {
    if (!projectId) return;
    try {
      const [subRes, scoreRes] = await Promise.all([
        api.get(`/api/student/projects/${projectId}/submissions`),
        api.get(`/api/student/projects/${projectId}/score-summary`),
      ]);
      setSubmissions(subRes.data.submissions || []);
      setScores(scoreRes.data.scores || []);
      setScoreSummary(scoreRes.data.summary || { milestone_avg: null, final_score: null, final_evaluated_at: null });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load project details.');
    }
  };

  useEffect(() => {
    loadCourses();
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadSelectedProjectData(selectedProjectId);
    }
  }, [selectedProjectId]);

  const extractCodeSnippets = async () => {
    if (!selectedFiles.length) {
      return { filePaths: [], codeSnippets: [] };
    }

    const files = selectedFiles.slice(0, MAX_FILES);
    let usedChars = 0;
    const snippets = [];
    const filePaths = files.map((file) => file.name);

    for (const file of files) {
      const remaining = MAX_TOTAL_SNIPPET_CHARS - usedChars;
      if (remaining <= 0) break;

      const raw = await file.text();
      const trimmed = raw.slice(0, Math.min(MAX_CHARS_PER_FILE, remaining));
      usedChars += trimmed.length;

      snippets.push({ file_name: file.name, content: trimmed });
    }

    const fileLimitHit = selectedFiles.length > MAX_FILES;
    const tokenLimitHit = usedChars >= MAX_TOTAL_SNIPPET_CHARS;
    if (fileLimitHit || tokenLimitHit) {
      setFileNotice('Only a bounded part of selected files was sent to avoid high LLM token usage.');
    } else {
      setFileNotice('');
    }

    return {
      filePaths,
      codeSnippets: snippets,
    };
  };

  const handleJoinCourse = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await api.post('/api/student/enroll', { course_code: joinCode });
      setMessage('Joined course successfully.');
      setJoinCode('');
      loadCourses();
      loadProjects();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not join course.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitProposal = async (e) => {
    e.preventDefault();
    if (isCourseLockedForNewProposal) {
      setError('You already have an approved project in this course. New proposals are disabled.');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await api.post('/api/student/projects', {
        course_id: Number(proposalForm.course_id),
        title: proposalForm.title,
        idea_text: proposalForm.idea_text,
      });

      setMessage(res.data.message || 'Proposal submitted.');
      setProposalForm({ course_id: '', title: '', idea_text: '' });
      loadProjects();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit proposal.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitMilestone = async (e) => {
    e.preventDefault();
    if (!selectedProjectId) {
      setError('Select an approved project first.');
      return;
    }
    if (isSelectedProjectFinalized) {
      setError('Final submission already evaluated for this project. New submissions are disabled.');
      return;
    }
    if (isSelectedCourseSubmissionLocked) {
      setError('Submissions are locked by teacher for this course.');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);

    try {
      const { codeSnippets, filePaths } = await extractCodeSnippets();
      const payload = {
        ...submissionForm,
        progress_notes: submissionForm.progress_notes,
        file_paths: filePaths,
        code_snippets: codeSnippets,
      };

      const res = await api.post(`/api/student/projects/${selectedProjectId}/submissions`, payload);
      setMessage(res.data.message || 'Submission uploaded.');
      setSubmissionForm({ milestone: '', progress_notes: '', is_final: false });
      setSelectedFiles([]);
      loadSelectedProjectData(selectedProjectId);
      loadProjects();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit milestone.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') setFeedbackModal(null);
  }, []);

  useEffect(() => {
    if (feedbackModal) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [feedbackModal, handleKeyDown]);

  return (
    <>
    {feedbackModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => setFeedbackModal(null)}
      >
        <div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
            <div>
              <p className="text-lg font-bold text-[#292928]">
                Score: <span className="text-[#c3f832] bg-[#292928] rounded-lg px-2 py-0.5">{feedbackModal.score}</span>
                {feedbackModal.grade && (
                  <span className="ml-2 text-base font-semibold text-gray-600">· Grade {feedbackModal.grade}</span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {feedbackModal.is_final ? '🏁 Final Submission' : '📌 Milestone'} · {new Date(feedbackModal.evaluated_at).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => setFeedbackModal(null)}
              className="ml-4 shrink-0 text-gray-400 hover:text-gray-700 transition-colors text-xl leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {/* Body */}
          <div className="overflow-y-auto px-6 py-4 flex-1">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{feedbackModal.feedback}</p>
          </div>
          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
            <button
              onClick={() => setFeedbackModal(null)}
              className="bg-[#292928] hover:bg-black text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
    <LayoutShell
      title="Student Portal"
      subtitle="Join courses, submit your project proposal, upload milestones, and track feedback/grades."
    >
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>}
      {message && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">{message}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-[#292928] mb-4">Join a Course</h2>
          <form onSubmit={handleJoinCourse} className="space-y-3">
            <input
              className={inputClass}
              placeholder="Enter course code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#292928] hover:bg-black disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl"
            >
              {loading ? 'Joining...' : 'Join Course'}
            </button>
          </form>

          <div className="mt-4 border-t border-gray-200 pt-4 space-y-2 max-h-56 overflow-auto pr-1">
            {courses.map((course) => (
              <div key={course.id} className="border border-gray-200 rounded-xl p-3 bg-[#fafafa]">
                <p className="text-sm font-semibold text-[#292928]">{course.course_code}</p>
                <p className="text-xs text-gray-600">{course.title}</p>
                <p className="text-xs mt-1 text-gray-500">Teacher: {course.teacher_name}</p>
                <p className="text-xs mt-1">
                  <span className={`font-semibold ${course.enrolled ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {course.enrolled ? 'Enrolled' : 'Not enrolled'}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className={`${cardClass} xl:col-span-2`}>
          <h2 className="text-lg font-semibold text-[#292928] mb-4">Submit Project Proposal</h2>
          <form onSubmit={handleSubmitProposal} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              className={inputClass}
              value={proposalForm.course_id}
              onChange={(e) => setProposalForm((prev) => ({ ...prev, course_id: e.target.value }))}
              required
            >
              <option value="">Select enrolled course</option>
              {courses.filter((course) => course.enrolled).map((course) => (
                <option key={course.id} value={course.id}>
                  {course.course_code} - {course.title}
                </option>
              ))}
            </select>

            <input
              className={inputClass}
              placeholder="Project title"
              value={proposalForm.title}
              onChange={(e) => setProposalForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />

            <textarea
              className={`${inputClass} md:col-span-2 min-h-24`}
              placeholder="Describe your idea, scope, tools, and expected outcome"
              value={proposalForm.idea_text}
              onChange={(e) => setProposalForm((prev) => ({ ...prev, idea_text: e.target.value }))}
              required
            />

            <button
              type="submit"
              disabled={loading || isCourseLockedForNewProposal}
              className="md:col-span-2 bg-[#292928] hover:bg-black disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl"
            >
              {loading ? 'Submitting...' : isCourseLockedForNewProposal ? 'Proposal Locked For Course' : 'Submit Proposal'}
            </button>
            {isCourseLockedForNewProposal && (
              <p className="md:col-span-2 text-xs text-amber-700">
                This course already has your approved project, so you cannot add another project.
              </p>
            )}
          </form>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-5">
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-[#292928] mb-3">Your Projects</h2>
          <div className="space-y-2 max-h-96 overflow-auto pr-1">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(String(project.id))}
                className={`w-full text-left rounded-xl border px-3 py-2 transition-all ${String(project.id) === selectedProjectId ? 'border-[#c3f832] bg-[#fbffe6]' : 'border-gray-200 bg-[#fafafa] hover:bg-white'}`}
              >
                <p className="font-semibold text-[#292928] text-sm">{project.title}</p>
                <p className="text-xs text-gray-600">{project.course_code} • {project.course_title}</p>
                <p className="text-xs mt-1">
                  Status: <span className={`font-semibold ${project.agent_status === 'approved' ? 'text-emerald-600' : 'text-red-600'}`}>{project.agent_status}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{project.agent_feedback}</p>
              </button>
            ))}
            {!projects.length && <p className="text-sm text-gray-500">No projects yet.</p>}
          </div>
        </section>

        <section className={`${cardClass} xl:col-span-2`}>
          <h2 className="text-lg font-semibold text-[#292928] mb-4">Milestone / Final Submission</h2>
          <form onSubmit={handleSubmitMilestone} className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <select
              className={inputClass}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              required
            >
              <option value="">Select approved project</option>
              {approvedProjects.map((project) => (
                <option key={project.id} value={project.id}>{project.title} ({project.course_code})</option>
              ))}
            </select>

            <input
              className={inputClass}
              placeholder="Milestone name (e.g. Milestone 1)"
              value={submissionForm.milestone}
              onChange={(e) => setSubmissionForm((prev) => ({ ...prev, milestone: e.target.value }))}
              required
            />

            <textarea
              className={`${inputClass} md:col-span-2 min-h-24`}
              placeholder="Progress update, implementation details, and results"
              value={submissionForm.progress_notes}
              onChange={(e) => setSubmissionForm((prev) => ({ ...prev, progress_notes: e.target.value }))}
              required
            />

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Attach code files (optional)</label>
              <input
                type="file"
                multiple
                accept=".js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.cs,.go,.rb,.php,.rs,.sql,.md,.txt,.json,.yaml,.yml"
                onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                className="w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#292928] file:px-3 file:py-2 file:text-white file:text-xs file:font-semibold"
              />
              {!!selectedFiles.length && (
                <p className="text-xs text-gray-500 mt-2">
                  {selectedFiles.length} file(s) selected. Up to {MAX_FILES} files and {MAX_TOTAL_SNIPPET_CHARS} total characters are sent to the evaluator.
                </p>
              )}
              {!!fileNotice && <p className="text-xs text-amber-700 mt-2">{fileNotice}</p>}
            </div>

            <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={submissionForm.is_final}
                onChange={(e) => setSubmissionForm((prev) => ({ ...prev, is_final: e.target.checked }))}
              />
              Mark this as final submission
            </label>

            <button
              type="submit"
              disabled={loading || isSelectedProjectFinalized || isSelectedCourseSubmissionLocked}
              className="md:col-span-2 bg-[#c3f832] hover:brightness-95 disabled:opacity-60 text-[#292928] font-semibold py-2.5 rounded-xl"
            >
              {loading
                ? 'Uploading...'
                : isSelectedCourseSubmissionLocked
                  ? 'Submission Locked By Teacher'
                  : isSelectedProjectFinalized
                    ? 'Submission Locked After Final'
                    : 'Submit'}
            </button>
            {isSelectedCourseSubmissionLocked && (
              <p className="md:col-span-2 text-xs text-amber-700">
                Teacher has locked submissions for this course. You cannot add new submissions.
              </p>
            )}
            {isSelectedProjectFinalized && (
              <p className="md:col-span-2 text-xs text-amber-700">
                Final score is already generated for this project. Additional submissions are disabled.
              </p>
            )}
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-gray-200 rounded-xl p-3 bg-[#fafafa] max-h-72 overflow-auto">
              <p className="text-sm font-semibold text-[#292928] mb-2">Submission History</p>
              <div className="space-y-2">
                {submissions.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-2 bg-white">
                    <p className="text-xs font-semibold text-[#292928]">{item.milestone}</p>
                    <p className="text-xs text-gray-500">{new Date(item.submitted_at).toLocaleString()}</p>
                    {!!item.file_paths?.length && (
                      <p className="text-xs text-gray-500 mt-1">Files: {item.file_paths.join(', ')}</p>
                    )}
                    <p className="text-xs text-gray-700 mt-1 whitespace-pre-line line-clamp-4">{item.progress_notes}</p>
                  </div>
                ))}
                {!submissions.length && <p className="text-sm text-gray-500">Select a project to see submissions.</p>}
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl p-3 bg-[#fafafa] max-h-72 overflow-auto">
              <p className="text-sm font-semibold text-[#292928] mb-2">Scorecard</p>
              <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-white border border-gray-200 rounded-lg p-2">
                  <p className="text-[11px] text-gray-500">Milestone Average</p>
                  <p className="text-sm font-semibold text-[#292928]">{scoreSummary.milestone_avg ?? 'N/A'}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-2">
                  <p className="text-[11px] text-gray-500">Final Score</p>
                  <p className="text-sm font-semibold text-[#292928]">{scoreSummary.final_score ?? 'Pending'}</p>
                </div>
              </div>
              <div className="space-y-2">
                {scores.map((score, idx) => (
                  <button
                    key={idx}
                    onClick={() => setFeedbackModal(score)}
                    className="w-full text-left border border-gray-200 rounded-lg p-2 bg-white hover:border-[#c3f832] hover:bg-[#fbffe6] transition-all group"
                    title="Click to read full feedback"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[#292928]">Score: {score.score}{score.grade ? ` · Grade ${score.grade}` : ''}</p>
                      <span className="text-[10px] text-gray-400 group-hover:text-[#292928] transition-colors shrink-0">Read full ↗</span>
                    </div>
                    <p className="text-xs text-gray-500">{score.is_final ? '🏁 Final' : '📌 Milestone'} · {new Date(score.evaluated_at).toLocaleString()}</p>
                    <p className="text-xs text-gray-700 mt-1 line-clamp-2">{score.feedback}</p>
                  </button>
                ))}
                {!scores.length && <p className="text-sm text-gray-500">No scores yet. Select a project and submit milestone/final work to generate scores.</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </LayoutShell>
    </>
  );
};

export default StudentDashboard;
