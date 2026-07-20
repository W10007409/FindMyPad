import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const [empNo, setEmpNo] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const auth = useAuth();
  const navigate = useNavigate();
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ empNo, password }, {
      onSuccess: (d) => {
        auth.login(d.token, { role: d.role, name: d.name, empNo: d.empNo, mustChangePassword: d.mustChangePassword });
        navigate(d.mustChangePassword ? '/change-password' : '/', { replace: true });
      },
    });
  }
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border p-6 dark:border-gray-700">
      <h1 className="mb-1 text-xl font-bold">PadTracker</h1>
      <p className="mb-4 text-sm text-gray-500">사번과 비밀번호로 로그인하세요.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">사번
          <input autoFocus className="mt-1 w-full rounded border p-2 dark:bg-gray-800" value={empNo} onChange={(e) => setEmpNo(e.target.value)} /></label>
        <label className="block text-sm">비밀번호
          <input type="password" className="mt-1 w-full rounded border p-2 dark:bg-gray-800" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button type="submit" disabled={login.isPending} className="w-full rounded bg-blue-600 p-2 text-white disabled:opacity-50">로그인</button>
        {login.isError && <p className="text-sm text-red-600">로그인 실패 — 사번/비밀번호를 확인하세요</p>}
        <p className="text-xs text-gray-400">최초 비밀번호는 <b>1234</b> 입니다. 첫 로그인 시 변경해야 합니다.</p>
      </form>
    </div>
  );
}
