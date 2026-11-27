'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BudgetSettings, Transaction, TxType } from '@/lib/types';
import { addDays, getTodayStr } from '@/lib/format';

export interface TxDraft {
  type: TxType;
  amountCents: number;
  categoryId: string;
  date: string;
  note: string;
}

interface Props {
  initialTransactions?: Transaction[];
  initialBudget?: BudgetSettings;
  storageMode: 'supabase' | 'local';
  pinEnabled: boolean;
}

const DEFAULT_BUDGET: BudgetSettings = {
  monthlyCents: 200000,
  monthlyOverrides: {},
  categories: {},
  recurringTemplates: [],
};

const CACHE_KEY = 'jianzhang_cache_v1';
const PAGE_CACHE_NAME = 'jianzhang-pages-v1';

interface CachedSnapshot {
  transactions: Transaction[];
  budget: BudgetSettings;
  savedAt: number;
}

function readLocalCache(): CachedSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedSnapshot>;
    if (!Array.isArray(parsed.transactions) || !parsed.budget) return null;
    return {
      transactions: parsed.transactions,
      budget: {
        monthlyCents: Number(parsed.budget.monthlyCents ?? 200000),
        monthlyOverrides: parsed.budget.monthlyOverrides || {},
        categories: parsed.budget.categories || {},
        recurringTemplates: Array.isArray(parsed.budget.recurringTemplates)
          ? parsed.budget.recurringTemplates
          : [],
      },
      savedAt: Number(parsed.savedAt || 0),
    };
  } catch {
    return null;
  }
}

function writeLocalCache(transactions: Transaction[], budget: BudgetSettings): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedSnapshot = {
      transactions,
      budget,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

function clearClientCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
  if ('caches' in window) {
    void window.caches.delete(PAGE_CACHE_NAME).catch(() => undefined);
  }
}

function sortTransactions(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) =>
    a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date),
  );
}

function MobileBootShell() {
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col">
      <header className="shark-yellow px-4 pt-3 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] text-[#555555] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse inline-block" />
            <span>启动中</span>
          </div>
          <div className="text-base font-bold tracking-wide text-[#222222]">简账</div>
          <div className="w-16" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-10 rounded-lg bg-black/5 animate-pulse" />
          <div className="h-10 rounded-lg bg-black/5 animate-pulse" />
          <div className="h-10 rounded-lg bg-black/5 animate-pulse" />
        </div>
      </header>
      <div className="px-3 -mt-3 space-y-3">
        <div className="h-16 rounded-2xl bg-white shadow-sm animate-pulse" />
        <div className="h-24 rounded-2xl bg-white animate-pulse" />
        <div className="h-24 rounded-2xl bg-white animate-pulse" />
      </div>
    </div>
  );
}

function DesktopBootShell() {
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center text-sm text-[#888888]">
      正在加载简账工作台...
    </div>
  );
}

// Split Mobile and Desktop bundles so mobile phones never download/parse/render DesktopView
const MobileView = dynamic(() => import('./MobileView'), {
  ssr: false,
  loading: () => <MobileBootShell />,
});

const DesktopView = dynamic(() => import('./DesktopView'), {
  ssr: false,
  loading: () => <DesktopBootShell />,
});

export default function BookkeepingApp({
  initialTransactions,
  initialBudget,
  storageMode,
  pinEnabled,
}: Props) {
  const hasServerSeed = initialTransactions !== undefined && initialBudget !== undefined;
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions ?? []);
  const [budget, setBudget] = useState<BudgetSettings>(initialBudget ?? DEFAULT_BUDGET);
  const [toast, setToast] = useState<string>('');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [bgRefreshing, setBgRefreshing] = useState<boolean>(!hasServerSeed);
  const [hasLoadedData, setHasLoadedData] = useState<boolean>(hasServerSeed);
  const [viewportMode, setViewportMode] = useState<'unknown' | 'mobile' | 'desktop'>('unknown');
  const tempIdSeq = useRef(-1);

  const syncing = pendingCount > 0 || bgRefreshing;
  const initialLoading = !hasLoadedData && bgRefreshing;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? '' : prev));
    }, 2400);
  }, []);

  // Register lightweight PWA Service Worker for instant static-asset & shell loading
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  // Detect mobile vs desktop once on mount and on window resize
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const syncViewport = () => setViewportMode(mq.matches ? 'desktop' : 'mobile');
    syncViewport();
    mq.addEventListener('change', syncViewport);
    return () => mq.removeEventListener('change', syncViewport);
  }, []);

  const refreshAll = useCallback(async () => {
    setBgRefreshing(true);
    try {
      const res = await fetch('/api/transactions', { cache: 'no-store' });
      if (res.status === 401) {
        clearClientCaches();
        window.location.reload();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        transactions: Transaction[];
        budget: BudgetSettings;
      };
      setTransactions(data.transactions);
      setBudget(data.budget);
      setHasLoadedData(true);
      writeLocalCache(data.transactions, data.budget);
    } catch {
      // Offline or transient network error: keep showing local cache silently
    } finally {
      setBgRefreshing(false);
    }
  }, []);

  // Hydrate immediately from localStorage cache (<10ms), then refresh from cloud in background
  useEffect(() => {
    const cached = readLocalCache();
    if (cached && !hasServerSeed) {
      setTransactions(cached.transactions);
      setBudget(cached.budget);
      setHasLoadedData(true);
    }
    if (!hasServerSeed) {
      void refreshAll();
    }
  }, [hasServerSeed, refreshAll]);

  // Keep local cache in sync after any local optimistic mutation or server sync
  useEffect(() => {
    if (!hasLoadedData) return;
    writeLocalCache(transactions, budget);
  }, [hasLoadedData, transactions, budget]);

  // Optimistic Create: updates UI immediately (0ms feel), syncs in background
  const handleCreateTx = useCallback(
    async (draft: TxDraft): Promise<Transaction | null> => {
      const tempId = tempIdSeq.current--;
      const optimistic: Transaction = {
        id: tempId,
        type: draft.type,
        amountCents: draft.amountCents,
        categoryId: draft.categoryId,
        date: draft.date,
        note: draft.note,
        createdAt: new Date().toISOString(),
      };

      setTransactions((prev) => sortTransactions([optimistic, ...prev]));
      setHasLoadedData(true);
      setPendingCount((c) => c + 1);

      void (async () => {
        try {
          const res = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            setTransactions((prev) => prev.filter((t) => t.id !== tempId));
            showToast(err.error || '云端保存失败，已撤销');
            return;
          }
          const data = (await res.json()) as { transaction: Transaction };
          setTransactions((prev) =>
            sortTransactions(prev.map((t) => (t.id === tempId ? data.transaction : t))),
          );
        } catch {
          setTransactions((prev) => prev.filter((t) => t.id !== tempId));
          showToast('网络异常，记账未能同步');
        } finally {
          setPendingCount((c) => Math.max(0, c - 1));
        }
      })();

      return optimistic;
    },
    [showToast],
  );

  // Optimistic Update
  const handleUpdateTx = useCallback(
    async (id: number, patch: Partial<TxDraft>): Promise<Transaction | null> => {
      if (id < 0) {
        showToast('正在同步中，请稍候再试');
        return null;
      }

      let previous: Transaction | undefined;
      let nextTx: Transaction | null = null;
      setTransactions((prev) => {
        previous = prev.find((t) => t.id === id);
        if (!previous) return prev;
        nextTx = { ...previous, ...patch };
        return sortTransactions(prev.map((t) => (t.id === id ? nextTx! : t)));
      });

      setPendingCount((c) => c + 1);
      void (async () => {
        try {
          const res = await fetch(`/api/transactions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            if (previous) {
              setTransactions((prev) =>
                sortTransactions(prev.map((t) => (t.id === id ? previous! : t))),
              );
            }
            showToast(err.error || '更新失败，已恢复');
            return;
          }
          const data = (await res.json()) as { transaction: Transaction };
          setTransactions((prev) =>
            sortTransactions(prev.map((t) => (t.id === id ? data.transaction : t))),
          );
        } catch {
          if (previous) {
            setTransactions((prev) =>
              sortTransactions(prev.map((t) => (t.id === id ? previous! : t))),
            );
          }
          showToast('网络异常，修改未保存');
        } finally {
          setPendingCount((c) => Math.max(0, c - 1));
        }
      })();

      return nextTx;
    },
    [showToast],
  );

  // Optimistic Delete
  const handleDeleteTx = useCallback(
    async (id: number): Promise<boolean> => {
      if (id < 0) {
        showToast('正在同步中，请稍候');
        return false;
      }
      let removed: Transaction | undefined;
      setTransactions((prev) => {
        removed = prev.find((t) => t.id === id);
        return prev.filter((t) => t.id !== id);
      });
      showToast('已删除');
      setPendingCount((c) => c + 1);

      void (async () => {
        try {
          const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            if (removed) setTransactions((prev) => sortTransactions([removed!, ...prev]));
            showToast('删除失败，已恢复');
          }
        } catch {
          if (removed) setTransactions((prev) => sortTransactions([removed!, ...prev]));
          showToast('网络异常，删除失败');
        } finally {
          setPendingCount((c) => Math.max(0, c - 1));
        }
      })();

      return true;
    },
    [showToast],
  );

  // Optimistic Batch Delete
  const handleBatchDeleteTx = useCallback(
    async (ids: number[]): Promise<boolean> => {
      const validIds = ids.filter((id) => id > 0);
      if (validIds.length === 0) return false;
      const idSet = new Set(validIds);
      let removedRows: Transaction[] = [];
      setTransactions((prev) => {
        removedRows = prev.filter((t) => idSet.has(t.id));
        return prev.filter((t) => !idSet.has(t.id));
      });
      showToast(`已批量删除 ${validIds.length} 条账单`);
      setPendingCount((c) => c + 1);

      void (async () => {
        try {
          const res = await fetch('/api/transactions/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: validIds }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            setTransactions((prev) => sortTransactions([...removedRows, ...prev]));
            showToast(err.error || '批量删除失败，已恢复');
          }
        } catch {
          setTransactions((prev) => sortTransactions([...removedRows, ...prev]));
          showToast('网络异常，批量删除失败');
        } finally {
          setPendingCount((c) => Math.max(0, c - 1));
        }
      })();

      return true;
    },
    [showToast],
  );

  const handleImportTx = useCallback(
    async (
      items: TxDraft[],
      skipDuplicates = true,
    ): Promise<{ importedCount: number; skippedDuplicates: number } | null> => {
      setPendingCount((c) => c + 1);
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
          setTransactions((prev) => sortTransactions([...data.imported, ...prev]));
          setHasLoadedData(true);
        }
        const msg =
          data.skippedDuplicates > 0
            ? `已入账 ${data.imported.length} 条，跳过重复 ${data.skippedDuplicates} 条`
            : `成功入账 ${data.imported.length} 条账单`;
        showToast(msg);
        return {
          importedCount: data.imported.length,
          skippedDuplicates: data.skippedDuplicates,
        };
      } catch {
        showToast('网络异常，请重试');
        return null;
      } finally {
        setPendingCount((c) => Math.max(0, c - 1));
      }
    },
    [showToast],
  );

  // Optimistic Budget & Templates Save
  const handleSaveBudget = useCallback(
    async (next: BudgetSettings): Promise<boolean> => {
      const prevBudget = budget;
      setBudget(next);
      setHasLoadedData(true);
      showToast('已保存');
      setPendingCount((c) => c + 1);

      void (async () => {
        try {
          const res = await fetch('/api/budgets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
          if (!res.ok) {
            setBudget(prevBudget);
            showToast('保存失败，已恢复');
            return;
          }
          const data = (await res.json()) as { budget: BudgetSettings };
          setBudget(data.budget);
        } catch {
          setBudget(prevBudget);
          showToast('网络异常，保存失败');
        } finally {
          setPendingCount((c) => Math.max(0, c - 1));
        }
      })();

      return true;
    },
    [budget, showToast],
  );

  const handleSeedSamples = useCallback(async () => {
    const today = getTodayStr();
    const samples: TxDraft[] = [
      { type: 'expense', amountCents: 500,   categoryId: 'c_shucai',   date: today, note: '早市青菜' },
      { type: 'expense', amountCents: 2800,  categoryId: 'c_canyin',   date: today, note: '午餐牛肉面' },
      { type: 'income',  amountCents: 15000, categoryId: 'i_baoxiao',  date: today, note: '报销到账' },
      { type: 'expense', amountCents: 200,   categoryId: 'c_jiaotong', date: addDays(today, -1), note: '地铁' },
      { type: 'expense', amountCents: 2775,  categoryId: 'c_shuidian', date: addDays(today, -1), note: '电费' },
      { type: 'expense', amountCents: 60000, categoryId: 'c_huangjin', date: addDays(today, -1), note: '定投黄金' },
      { type: 'expense', amountCents: 2078,  categoryId: 'c_gouwu',    date: addDays(today, -3), note: '日用采购' },
    ];
    await handleImportTx(samples, true);
  }, [handleImportTx]);

  const handleLogout = useCallback(async () => {
    clearClientCaches();
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.reload();
  }, []);

  const sharedProps = {
    transactions,
    budget,
    storageMode,
    pinEnabled,
    syncing,
    initialLoading,
    onCreateTx: handleCreateTx,
    onUpdateTx: handleUpdateTx,
    onDeleteTx: handleDeleteTx,
    onBatchDeleteTx: handleBatchDeleteTx,
    onImportTx: handleImportTx,
    onSaveBudget: handleSaveBudget,
    onSeedSamples: handleSeedSamples,
    onRefresh: refreshAll,
    onLogout: handleLogout,
    showToast,
  };

  return (
    <>
      {viewportMode === 'unknown' && (
        <>
          <div className="md:hidden">
            <MobileBootShell />
          </div>
          <div className="hidden md:block">
            <DesktopBootShell />
          </div>
        </>
      )}

      {viewportMode === 'mobile' && <MobileView {...sharedProps} />}
      {viewportMode === 'desktop' && <DesktopView {...sharedProps} />}

      {toast && (
        <div className="fixed bottom-32 md:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#333333] text-white text-xs font-medium shadow-lg pointer-events-none">
          {toast}
        </div>
      )}
    </>
  );
}
