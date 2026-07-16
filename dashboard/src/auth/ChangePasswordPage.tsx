import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChangePassword } from '../api/hooks';
import { useAuth } from './AuthContext';

export function ChangePasswordPage() {
  const { session, clearMustChange, token } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);
  const change = useChangePassword();
  const navigate = useNavigate();

  if (!token) { navigate('/login', { replace: true }); return null; }
  const forced = session?.mustChangePassword ?? false;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (next.length < 4) { setLocalErr('새 비밀번호는 4자 이상이어야 합니다.'); return; }
    if (next === '1234') { setLocalErr('최초 비밀번호(1234)는 새 비밀번호로 쓸 수 없습니다.'); return; }
    if (next !== confirm) { setLocalErr('새 비밀번호가 일치하지 않습니다.'); return; }
    change.mutate({ currentPassword: current, newPassword: next }, {
      onSuccess: () => { clearMustChange(); navigate('/', { replace: true }); },
    });
  }
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border p-6 dark:border-gray-700">
      <h1 className="mb-1 text-xl font-bold">비밀번호 변경</h1>
      <p className="mb-4 text-sm text-gray-500">
        {forced ? '최초 로그인입니다. 사용할 비밀번호로 변경해 주세요.' : '비밀번호를 변경합니다.'}
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">현재 비밀번호{forced && ' (최초: 1234)'}
          <input type="password" autoFocus className="mt-1 w-full rounded border p-2 dark:bg-gray-800" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="block text-sm">새 비밀번호
          <input type="password" className="mt-1 w-full rounded border p-2 dark:bg-gray-800" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="block text-sm">새 비밀번호 확인
          <input type="password" className="mt-1 w-full rounded border p-2 dark:bg-gray-800" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <button type="submit" disabled={change.isPending} className="w-full rounded bg-blue-600 p-2 text-white disabled:opacity-50">변경</button>
        {localErr && <p className="text-sm text-red-600">{localErr}</p>}
        {change.isError && <p className="text-sm text-red-600">변경 실패 — 현재 비밀번호를 확인하세요</p>}
      </form>
    </div>
  );
}
