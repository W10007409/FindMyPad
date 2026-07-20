import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, isAdmin } from '../auth/AuthContext';
import { ThemeToggle } from '../theme/ThemeToggle';

export function Layout() {
  const { logout, session } = useAuth();
  const admin = isAdmin(session);
  const cls = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 text-sm ${isActive ? 'font-semibold text-blue-600' : 'text-gray-600 dark:text-gray-300'}`;
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between border-b px-4 dark:border-gray-700">
        <nav className="flex gap-1">
          <NavLink to="/" end className={cls}>{admin ? '검색' : '내 패드'}</NavLink>
          {admin && <NavLink to="/stale" className={cls}>무응답</NavLink>}
          {admin && <NavLink to="/ap-map" className={cls}>AP매핑</NavLink>}
        </nav>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {session && <span>{session.name}{admin ? ' (관리자)' : ''}</span>}
          <NavLink to="/change-password" className="hover:underline">비밀번호</NavLink>
          <button onClick={logout} className="hover:underline">로그아웃</button>
          <ThemeToggle />
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
