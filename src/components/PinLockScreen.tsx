'use client';

import { useState } from 'react';

export default function PinLockScreen() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || '密码错误');
        setLoading(false);
        return;
      }
      window.location.reload();
    } catch {
      setError('网络异常，请重试');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs bg-white rounded-3xl shadow-sm border border-[#EAEAEA] p-6 space-y-5 text-center"
      >
        <div className="w-14 h-14 mx-auto rounded-2xl shark-yellow flex items-center justify-center text-2xl font-bold text-[#222222]">
          简
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#222222]">简账 · 个人记账本</h1>
          <p className="text-xs text-[#888888] mt-1">请输入访问密码（验证后 30 天免输）</p>
        </div>

        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="输入私人密码"
          autoFocus
          className="w-full bg-[#F7F8FA] border border-[#E5E5E5] rounded-xl px-4 py-3 text-center text-base tracking-widest focus:outline-none focus:border-[#FFDA44]"
        />

        {error && <div className="text-xs text-[#E53935]">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl shark-yellow text-sm font-bold text-[#222222] hover:opacity-90 disabled:opacity-50"
        >
          {loading ? '验证中...' : '解锁进入'}
        </button>
      </form>
    </div>
  );
}
