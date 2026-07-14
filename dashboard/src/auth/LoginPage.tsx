import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const auth = useAuth();
  const navigate = useNavigate();
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ username, password }, { onSuccess: (d) => { auth.login(d.token); navigate('/', { replace: true }); } });
  }
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border p-6 dark:border-gray-700">
      <h1 className="mb-4 text-xl font-bold">PadTracker 관리자</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">아이디
          <input className="mt-1 w-full rounded border p-2 dark:bg-gray-800" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label className="block text-sm">비밀번호
          <input type="password" className="mt-1 w-full rounded border p-2 dark:bg-gray-800" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button type="submit" disabled={login.isPending} className="w-full rounded bg-blue-600 p-2 text-white disabled:opacity-50">로그인</button>
        {login.isError && <p className="text-sm text-red-600">로그인 실패 — 아이디/비밀번호를 확인하세요</p>}
      </form>
    </div>
  );
}
