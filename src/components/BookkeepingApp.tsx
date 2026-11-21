'use client';

import { useCallback, useState } from 'react';
import type { BudgetSettings, Transaction, TxType } from '@/lib/types';
import { addDays, getTodayStr } from '@/lib/format';
import MobileView from './MobileView';
import DesktopView from './DesktopView';

export interface TxDraft {
  type: TxType;
  amountCents: number;
  categoryId: string;
  date: string;
  note: string;
}

interface Props {
  initialTransactions: Transaction[];
  initialBudget: BudgetSettings;
  storageMode: 'supabase' | 'local';
  pinEnabled: boolean;
}

export default function BookkeepingApp({
  initialTransactions,
  initialBudget,
  storageMode,
  pinEnabled,
}: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [budget, setBudget] = useState<BudgetSettings>(initialBudget);
  const [toast, setToast] = useState<string>('');
  const [syncing, setSyncing] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? '' : prev));
    }, 2200);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        transactions: Transaction[];
        budget: BudgetSettings;
      };
      setTransactions(data.transactions);
      setBudget(data.budget);
    } catch {
      // ignore transient network errors
    }
  }, []);

  const handleCreateTx = useCallback(
    async (draft: TxDraft): Promise<Transaction | null> => {
      setSyncing(true);
      try {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          showToast(err.error || '保存失败');
          return null;
        }
        const data = (await res.json()) as { transaction: Transaction };
        setTransactions((prev) =>
          [data.transaction, ...prev].sort((a, b) =>
            a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date),
          ),
        );
        return data.transaction;
      } catch {
        showToast('网络异常，请重试');
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [showToast],
  );

  const handleUpdateTx = useCallback(
    async (id: number, patch: Partial<TxDraft>): Promise<Transaction | null> => {
      setSyncing(true);
      try {
        const res = await fetch(`/api/transactions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          showToast(err.error || '更新失败');
          return null;
        }
        const data = (await res.json()) as { transaction: Transaction };
        setTransactions((prev) =>
          prev
            .map((t) => (t.id === id ? data.transaction : t))
            .sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date))),
        );
        return data.transaction;
      } catch {
        showToast('网络异常，请重试');
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [showToast],
  );

  const handleDeleteTx = useCallback(
    async (id: number): Promise<boolean> => {
      setSyncing(true);
      try {
        const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          showToast('删除失败');
          return false;
        }
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        showToast('已删除');
        return true;
      } catch {
        showToast('网络异常，请重试');
        return false;
      } finally {
        setSyncing(false);
      }
    },
    [showToast],
  );

  const handleSaveBudget = useCallback(
    async (next: BudgetSettings): Promise<boolean> => {
      setSyncing(true);
      try {
        const res = await fetch('/api/budgets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!res.ok) {
          showToast('预算保存失败');
          return false;
        }
        const data = (await res.json()) as { budget: BudgetSettings };
        setBudget(data.budget);
        showToast('预算已保存');
        return true;
      } catch {
        showToast('网络异常，请重试');
        return false;
      } finally {
        setSyncing(false);
      }
    },
    [showToast],
  );

  const handleImportTx = useCallback(
    async (
      items: TxDraft[],
      skipDuplicates = true,
    ): Promise<{ importedCount: number; skippedDuplicates: number } | null> => {
      setSyncing(true);
      try {
        const res = await fetch('/api/transactions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, skipDuplicates }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          showToast(err.error || '导入失败');
          return null;
        }
        const data = (await res.json()) as {
          imported: Transaction[];
          skippedDuplicates: number;
        };
        if (data.imported.length > 0) {
          setTransactions((prev) =>
            [...data.imported, ...prev].sort((a, b) =>
              a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date),
            ),
          );
        }
        const msg =
          data.skippedDuplicates > 0
            ? `已导入 ${data.imported.length} 条，跳过重复 ${data.skippedDuplicates} 条`
            : `成功导入 ${data.imported.length} 条账单`;
        showToast(msg);
        return {
          importedCount: data.imported.length,
          skippedDuplicates: data.skippedDuplicates,
        };
      } catch {
        showToast('网络异常，请重试');
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [showToast],
  );

  const handleSeedSamples = useCallback(async () => {
    const today = getTodayStr();
    const samples: TxDraft[] = [
      { type: 'expense', amountCents: 500,   categoryId: 'c_shucai',   date: today, note: '买菜' },
      { type: 'expense', amountCents: 2800,  categoryId: 'c_canyin',   date: today, note: '午餐牛肉面' },
      { type: 'income',  amountCents: 15000, categoryId: 'i_baoxiao',  date: today, note: '报销到账' },
      { type: 'expense', amountCents: 200,   categoryId: 'c_jiaotong', date: addDays(today, -1), note: '地铁' },
      { type: 'expense', amountCents: 2775,  categoryId: 'c_shuidian', date: addDays(today, -1), note: '电费' },
      { type: 'expense', amountCents: 60000, categoryId: 'c_huangjin', date: addDays(today, -1), note: '定投黄金' },
      { type: 'expense', amountCents: 2078,  categoryId: 'c_gouwu',    date: addDays(today, -3), note: '日用采购' },
    ];
    for (const s of samples) {
      await handleCreateTx(s);
    }
    showToast('已填入 7 条示例账单');
  }, [handleCreateTx, showToast]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.reload();
  }, []);

  const sharedProps = {
    transactions,
    budget,
    storageMode,
    pinEnabled,
    syncing,
    onCreateTx: handleCreateTx,
    onUpdateTx: handleUpdateTx,
    onDeleteTx: handleDeleteTx,
    onImportTx: handleImportTx,
    onSaveBudget: handleSaveBudget,
    onSeedSamples: handleSeedSamples,
    onRefresh: refreshAll,
    onLogout: handleLogout,
    showToast,
  };

  return (
    <>
      {/* Mobile PWA View (< 768px) */}
      <div className="md:hidden">
        <MobileView {...sharedProps} />
      </div>

      {/* Desktop Review Workbench (>= 768px) */}
      <div className="hidden md:block">
        <DesktopView {...sharedProps} />
      </div>

      {/* Global Toast */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#333333] text-white text-xs font-medium shadow-lg pointer-events-none">
          {toast}
        </div>
      )}
    </>
  );
}
