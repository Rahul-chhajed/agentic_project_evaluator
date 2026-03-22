import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let res;
      if (role === 'teacher') {
        res = await api.post('/auth/teacher/login', { email, password });
      } else {
        res = await api.post('/auth/student/login', { student_id: studentId, password });
      }
      login(res.data.user, res.data.token);
      navigate(res.data.user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full bg-[#f8f8f8] border border-gray-200 focus:border-[#c3f832] focus:ring-2 focus:ring-[#c3f832]/30 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-400 outline-none transition-all duration-200 text-base';

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center p-6">

      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-3xl shadow-lg p-10">

        {/* Brand */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold tracking-widest text-[#c3f832] uppercase mb-2">AgenticAI</p>
          <h1 className="text-3xl font-bold text-[#292928]">Welcome Back</h1>
          <p className="text-gray-500 text-base mt-2">Sign in to continue your journey</p>
        </div>

        {/* Role toggle */}
        <div className="flex rounded-xl border border-gray-200 mb-6 overflow-hidden bg-[#f8f8f8]">
          {[
            { value: 'student', label: 'Student' },
            { value: 'teacher', label: 'Teacher' },
          ].map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => { setRole(r.value); setError(''); }}
              className={`flex-1 py-3 text-sm font-semibold transition-all duration-200 ${
                role === r.value
                  ? 'bg-[#c3f832] text-[#292928]'
                  : 'text-gray-500 hover:text-[#292928]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
            {error}
          </p>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {role === 'teacher' ? (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Email address</label>
              <input
                type="email"
                placeholder="you@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Student ID</label>
              <input
                type="text"
                placeholder="STU2024001"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#292928] hover:bg-black disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 text-base"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-gray-500 text-sm mt-6 text-center">
          {role === 'teacher' ? "Don't have an account?" : 'New here?'}{' '}
          <Link to="/signup" className="text-[#292928] font-semibold hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;