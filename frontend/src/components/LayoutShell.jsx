import { useAuth } from '../context/AuthContext';

const LayoutShell = ({ title, subtitle, children }) => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#f8f8f8] p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <header className="bg-white border border-gray-200 rounded-2xl px-5 py-4 sm:px-7 sm:py-5 shadow-sm mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-widest text-[#c3f832] uppercase mb-1">AgenticAI</p>
              <h1 className="text-xl sm:text-2xl font-bold text-[#292928]">{title}</h1>
              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-[#292928]">{user?.name}</p>
                <p className="text-xs text-gray-500">Role: {user?.role}</p>
              </div>
              <button
                onClick={logout}
                className="px-4 py-2 rounded-lg bg-[#292928] text-white text-sm font-semibold hover:bg-black transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
};

export default LayoutShell;
