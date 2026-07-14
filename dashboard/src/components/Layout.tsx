import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { logout } = useAuth();
  const cls = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 text-sm ${isActive ? 'font-semibold text-blue-600' : 'text-gray-600 dark:text-gray-300'}`;
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between border-b px-4 dark:border-gray-700">
        <nav className="flex gap-1">
          <NavLink to="/" end className={cls}>검색</NavLink>
          <NavLink to="/stale" className={cls}>무응답</NavLink>
          <NavLink to="/ap-map" className={cls}>AP매핑</NavLink>
        </nav>
        <button onClick={logout} className="text-sm text-gray-500 hover:underline">로그아웃</button>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
