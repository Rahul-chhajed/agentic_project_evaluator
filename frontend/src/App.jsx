import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './authorization/Login';
import SignUp from './authorization/SignUp';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';
import { subscribeToRequests } from './requestTracker';
import './index.css';

const FullScreenLoader = () => (
  <div className="fixed inset-0 z-[1000] bg-[#292928]/20 backdrop-blur-[1px] flex items-center justify-center px-4">
    <div className="bg-white border border-gray-200 rounded-2xl shadow-lg px-5 py-4 flex items-center gap-3">
      <div className="w-5 h-5 rounded-full border-2 border-[#292928] border-t-transparent animate-spin" />
      <p className="text-sm font-medium text-[#292928]">Sending request to server/LLM...</p>
    </div>
  </div>
);

// Protected route wrapper
const ProtectedRoute = ({ children, role }) => {
  const { user, isAuthReady } = useAuth();

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-[#292928] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route
        path="/teacher/dashboard"
        element={
          <ProtectedRoute role="teacher">
            <TeacherDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute role="student">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    return subscribeToRequests(setPendingRequests);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        {pendingRequests > 0 && <FullScreenLoader />}
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
