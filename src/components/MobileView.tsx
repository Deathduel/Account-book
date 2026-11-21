'use client';

import { useMemo, useState } from 'react';
import { EXPENSE_CATEGORIES, getCategoriesByType, getCategory } from '@/lib/categories';
import {
  buildRealChartData,
  getAllYearRows,
  getEffectiveMonthlyBudget,
  getMonthTotals,
  getRecentNotesForCategory,
  getYearMonthRows,
} from '@/lib/analytics';
import {
  daysInMonth,
  downloadCsv,
  evalCalcExpr,
  fmtNum,
  getMonthPrefix,
  getRecentWeeks,
  getTodayStr,
  getWeekday,
  pad2,
  splitMoneyParts,
} from '@/lib/format';
import {
  downloadCsvTemplate,
  parseBookkeepingCsv,
  readCsvFileText,
  type CsvParseResult,
} from '@/lib/csvImport';
import type { BudgetSettings, RecurringTemplate, Transaction, TxType } from '@/lib/types';
import type { TxDraft } from './BookkeepingApp';
import SharkLineChart from './SharkLineChart';
import MobilePickerSheet, { type PickerKind, type PickerRequest } from './MobilePickerSheet';

type MobileScreen =
  | 'feed'
  | 'charts'
  | 'add'
  | 'bill'
  | 'monthReport'
  | 'budget'
  | 'recurring'
  | 'singleRank'
  | 'calendar'
  | 'export';

interface Props {
  transactions: Transaction[];
  budget: BudgetSettings;
  storageMode: 'supabase' | 'local';
  pinEnabled: boolean;
  syncing: boolean;
  onCreateTx: (draft: TxDraft) => Promise<Transaction | null>;
  onUpdateTx: (id: number, patch: Partial<TxDraft>) => Promise<Transaction | null>;
  onDeleteTx: (id: number) => Promise<boolean>;
  onBatchDeleteTx: (ids: number[]) => Promise<boolean>;
  onImportTx: (
    items: TxDraft[],
    skipDuplicates?: boolean,
  ) => Promise<{ importedCount: number; skippedDuplicates: number } | null>;
  onSaveBudget: (next: BudgetSettings) => Promise<boolean>;
  onSeedSamples: () => Promise<void>;
  onLogout: () => Promise<void>;
  showToast: (msg: string) => void;
}

function SplitMoney({ cents, className = '' }: { cents: number; className?: string }) {
  const { sign, intPart, decPart } = splitMoneyParts(cents);
  return (
    <span className={`tabular-nums ${className}`}>
      {sign}
      {intPart}
      <span className="text-xs font-normal">.{decPart}</span>
    </span>
  );
}

export default function MobileView({
  transactions,
  budget,
  storageMode,
  pinEnabled,
  syncing,
  onCreateTx,
  onUpdateTx,
  onDeleteTx,
  onBatchDeleteTx,
  onImportTx,
  onSaveBudget,
  onSeedSamples,
  onLogout,
  showToast,
}: Props) {
  const todayStr = useMemo(() => getTodayStr(), []);
  const todayYear = Number(todayStr.slice(0, 4));
  const todayMonth = Number(todayStr.slice(5, 7));
  const recentWeeks = useMemo(() => getRecentWeeks(todayStr, 6), [todayStr]);

  const [screen, setScreen] = useState<MobileScreen>('feed');
  const [feedYear, setFeedYear] = useState(todayYear);
  const [feedMonth, setFeedMonth] = useState(todayMonth);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [contextTxId, setContextTxId] = useState<number | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmBatchDeleteOpen, setConfirmBatchDeleteOpen] = useState(false);

  // Mobile exclude investment toggle (charts + bill + monthReport)
  const [excludeInvestment, setExcludeInvestment] = useState(false);

  // Charts state
  const [chartType, setChartType] = useState<TxType>('expense');
  const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false);
  const [chartScope, setChartScope] = useState<'week' | 'month' | 'year'>('month');
  const [chartWeekIdx, setChartWeekIdx] = useState(recentWeeks.length - 1);
  const [chartYear, setChartYear] = useState(todayYear);
  const [chartMonth, setChartMonth] = useState(todayMonth);
  const [expandedChartCatId, setExpandedChartCatId] = useState<string | null>(null);

  // Bill state
  const [billTab, setBillTab] = useState<'month' | 'year'>('month');
  const [billYear, setBillYear] = useState(todayYear);
  const [reportMonth, setReportMonth] = useState(todayMonth);

  // Single rank state
  const [singleRankType, setSingleRankType] = useState<TxType>('expense');
  const [singleRankSort, setSingleRankSort] = useState<'amount' | 'time'>('amount');

  // Calendar state
  const [calYear, setCalYear] = useState(todayYear);
  const [calMonth, setCalMonth] = useState(todayMonth);
  const [calSelectedDate, setCalSelectedDate] = useState(todayStr);

  // Export / Import state
  const [dataTab, setDataTab] = useState<'export' | 'import'>('export');
  const [exportScope, setExportScope] = useState<'month' | 'year' | 'all'>('month');
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<CsvParseResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Budget modals (supports per-month override or global default)
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetApplyMode, setBudgetApplyMode] = useState<'month' | 'default'>('month');
  const [catBudgetModalOpen, setCatBudgetModalOpen] = useState(false);
  const [catBudgetId, setCatBudgetId] = useState(EXPENSE_CATEGORIES[0].id);
  const [catBudgetInput, setCatBudgetInput] = useState('500');

  // Recurring template form
  const [recAddOpen, setRecAddOpen] = useState(false);
  const [recType, setRecType] = useState<TxType>('expense');
  const [recCatId, setRecCatId] = useState('c_zhufang');
  const [recAmount, setRecAmount] = useState('');
  const [recDay, setRecDay] = useState('5');
  const [recNote, setRecNote] = useState('');

  // Add / Edit entry state
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [entryType, setEntryType] = useState<TxType>('expense');
  const [entryCatId, setEntryCatId] = useState<string>('c_shucai');
  const [entryExpr, setEntryExpr] = useState<string>('');
  const [entryDate, setEntryDate] = useState<string>(todayStr);
  const [entryNote, setEntryNote] = useState<string>('');

  // Unified Bottom-Sheet Picker
  const [pickerReq, setPickerReq] = useState<PickerRequest | null>(null);

  const goScreen = (next: MobileScreen) => {
    setScreen(next);
    setContextTxId(null);
    setChartTypeMenuOpen(false);
    setBatchMode(false);
    setSelectedIds([]);
    setExpandedChartCatId(null);
  };

  const openAdd = (tx?: Transaction, defaultDate?: string) => {
    if (tx) {
      setEditingTxId(tx.id);
      setEntryType(tx.type);
      setEntryCatId(tx.categoryId);
      setEntryExpr((tx.amountCents / 100).toString());
      setEntryDate(tx.date);
      setEntryNote(tx.note || '');
    } else {
      setEditingTxId(null);
      setEntryType('expense');
      setEntryCatId('c_shucai');
      setEntryExpr('');
      setEntryDate(defaultDate || todayStr);
      setEntryNote('');
    }
    setContextTxId(null);
    setScreen('add');
  };

  const openPicker = (kind: PickerKind) => {
    if (kind === 'feedYM') setPickerReq({ kind, year: feedYear, month: feedMonth, day: 1 });
    else if (kind === 'billYear') setPickerReq({ kind, year: billYear, month: 1, day: 1 });
    else if (kind === 'chartYM') setPickerReq({ kind, year: chartYear, month: chartMonth, day: 1 });
    else if (kind === 'chartYear') setPickerReq({ kind, year: chartYear, month: 1, day: 1 });
    else if (kind === 'calYM') setPickerReq({ kind, year: calYear, month: calMonth, day: 1 });
    else if (kind === 'entryDate') {
      const [y, m, d] = entryDate.split('-').map(Number);
      setPickerReq({ kind, year: y || todayYear, month: m || todayMonth, day: d || 1 });
    }
  };

  const handlePickerConfirm = (kind: PickerKind, y: number, m: number, d: number) => {
    if (kind === 'feedYM') {
      setFeedYear(y);
      setFeedMonth(m);
      setSelectedIds([]);
      setBatchMode(false);
    } else if (kind === 'billYear') {
      setBillYear(y);
    } else if (kind === 'chartYM') {
      setChartYear(y);
      setChartMonth(m);
      setExpandedChartCatId(null);
    } else if (kind === 'chartYear') {
      setChartYear(y);
      setExpandedChartCatId(null);
    } else if (kind === 'calYM') {
      setCalYear(y);
      setCalMonth(m);
      const maxD = daysInMonth(y, m);
      const keepD = Math.min(Number(calSelectedDate.slice(8, 10)) || 1, maxD);
      setCalSelectedDate(`${y}-${pad2(m)}-${pad2(keepD)}`);
    } else if (kind === 'entryDate') {
      setEntryDate(`${y}-${pad2(m)}-${pad2(d)}`);
    }
    setPickerReq(null);
  };

  const handleKeypad = (k: string) => {
    setEntryExpr((prev) => {
      if (k === 'BACK') return prev.slice(0, -1);
      if (k === '+' || k === '-') {
        if (!prev) return prev;
        return /[+-]$/.test(prev) ? prev.slice(0, -1) + k : prev + k;
      }
      if (k === '.') {
        const last = prev.split(/[+-]/).pop() || '';
        if (last.includes('.')) return prev;
        return last === '' ? `${prev}0.` : `${prev}.`;
      }
      const last = prev.split(/[+-]/).pop() || '';
      if (last.includes('.') && last.split('.')[1].length >= 2) return prev;
      if (last === '0') return prev.slice(0, -1) + k;
      if (prev.length >= 16) return prev;
      return prev + k;
    });
  };

  const handleSaveEntry = async (keepOpen = false) => {
    const cents = evalCalcExpr(entryExpr);
    if (cents <= 0) {
      showToast('请输入大于 0 的金额');
      return;
    }
    const draft: TxDraft = {
      type: entryType,
      categoryId: entryCatId,
      amountCents: cents,
      date: entryDate,
      note: entryNote.trim(),
    };
    const cat = getCategory(entryCatId);
    const saved = editingTxId
      ? await onUpdateTx(editingTxId, draft)
      : await onCreateTx(draft);
    if (!saved) return;

    const [sy, sm] = entryDate.split('-').map(Number);
    if (sy && sm) {
      setFeedYear(sy);
      setFeedMonth(sm);
    }
    showToast(
      editingTxId
        ? `已修改：${draft.note || cat.name} ¥${fmtNum(cents)}`
        : `已记一笔：${draft.note || cat.name} ¥${fmtNum(cents)}`,
    );

    if (keepOpen && !editingTxId) {
      setEntryExpr('');
      setEntryNote('');
    } else {
      setEditingTxId(null);
      setScreen('feed');
    }
  };

  const getExportList = (scope: 'month' | 'year' | 'all') => {
    const sorted = [...transactions].sort((a, b) =>
      a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date),
    );
    if (scope === 'month') {
      const prefix = getMonthPrefix(feedYear, feedMonth);
      return sorted.filter((t) => t.date.startsWith(prefix));
    }
    if (scope === 'year') {
      return sorted.filter((t) => t.date.startsWith(`${feedYear}-`));
    }
    return sorted;
  };

  const handleDownloadCsv = (scope: 'month' | 'year' | 'all') => {
    const list = getExportList(scope);
    const suffix =
      scope === 'month'
        ? `${feedYear}年${feedMonth}月`
        : scope === 'year'
        ? `${feedYear}年`
        : '全部账单';
    downloadCsv(list, `简账_${suffix}.csv`);
    showToast(`已导出 ${list.length} 条账单`);
  };

  // Bottom 5-tab bar: 明细 | 图表 | + 记账 | 账单 | 导出
  const renderBottomNav = () => {
    const tabs: { id: MobileScreen | 'ADD'; label: string }[] = [
      { id: 'feed', label: '明细' },
      { id: 'charts', label: '图表' },
      { id: 'ADD', label: '记账' },
      { id: 'bill', label: '账单' },
      { id: 'export', label: '导出' },
    ];
    return (
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#EFEFEF] px-2 pt-2 mobile-bottom-lift grid grid-cols-5 items-end text-[#333333]">
        {tabs.map((it) => {
          const tabId = it.id;
          if (tabId === 'ADD') {
            return (
              <button
                key="ADD"
                type="button"
                onClick={() => openAdd()}
                className="flex flex-col items-center -mt-6"
              >
                <span className="w-12 h-12 rounded-full shark-yellow text-[#222222] border-[3px] border-white shadow-md flex items-center justify-center text-2xl font-light">
                  +
                </span>
                <span className="text-xs mt-0.5 text-[#666666]">记账</span>
              </button>
            );
          }
          const active = screen === tabId;
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => goScreen(tabId)}
              className="flex flex-col items-center gap-0.5"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  active ? 'shark-yellow text-[#222222]' : 'text-[#666666]'
                }`}
              >
                {tabId === 'feed' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M4 6h16M4 12h16M4 18h10" />
                  </svg>
                )}
                {tabId === 'charts' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M3 17l6-6 4 4 8-8" />
                    <path d="M14 7h7v7" />
                  </svg>
                )}
                {tabId === 'bill' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <path d="M8 8h8M8 12h8M8 16h5" />
                  </svg>
                )}
                {tabId === 'export' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  </svg>
                )}
              </span>
              <span className={`text-xs ${active ? 'font-semibold text-[#222222]' : 'text-[#888888]'}`}>
                {it.label}
              </span>
            </button>
          );
        })}
      </nav>
    );
  };

  // ============================================
  // 1. FEED SCREEN
  // ============================================
  if (screen === 'feed') {
    const monthTotals = getMonthTotals(transactions, feedYear, feedMonth, false);
    const prefix = getMonthPrefix(feedYear, feedMonth);
    let list = transactions.filter((t) => t.date.startsWith(prefix));
    if (searchQ.trim()) {
      const kw = searchQ.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.note.toLowerCase().includes(kw) ||
          getCategory(t.categoryId).name.toLowerCase().includes(kw),
      );
    }

    const grouped = new Map<string, Transaction[]>();
    for (const tx of list) {
      const arr = grouped.get(tx.date) ?? [];
      arr.push(tx);
      grouped.set(tx.date, arr);
    }
    const dates = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

    return (
      <div className="min-h-screen bg-[#F7F8FA] pb-36 flex flex-col">
        <header className="shark-yellow px-4 pt-3 pb-5 sticky top-0 z-20">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] text-[#555555] flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full inline-block ${
                  syncing ? 'bg-[#F59E0B] animate-pulse' : 'bg-[#22C55E]'
                }`}
              />
              <span>{syncing ? '同步中' : storageMode === 'supabase' ? '云端同步' : '本地存储'}</span>
            </div>
            <div className="text-base font-bold tracking-wide text-[#222222]">简账</div>
            <div className="flex items-center gap-2.5 text-[#222222]">
              <button
                type="button"
                onClick={() => {
                  setContextTxId(null);
                  setBatchMode((prev) => {
                    if (prev) setSelectedIds([]);
                    return !prev;
                  });
                }}
                className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                  batchMode ? 'bg-[#333333] text-white' : 'bg-black/10 text-[#222222]'
                }`}
              >
                {batchMode ? '完成' : '多选'}
              </button>
              <button type="button" onClick={() => setSearchOpen((v) => !v)} title="搜索">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </button>
              <button type="button" onClick={() => goScreen('calendar')} title="日历">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </button>
              {pinEnabled && (
                <button type="button" onClick={onLogout} className="text-xs text-[#444444]">
                  锁定
                </button>
              )}
            </div>
          </div>

          {searchOpen && (
            <div className="mb-2.5 flex items-center gap-2 bg-white/90 rounded-lg px-2.5 py-1.5">
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜索备注或分类..."
                className="flex-1 bg-transparent text-xs focus:outline-none text-[#222222]"
              />
              {searchQ && (
                <button type="button" onClick={() => setSearchQ('')} className="text-xs text-[#888888]">
                  ✕
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-12 items-end">
            <button
              type="button"
              onClick={() => openPicker('feedYM')}
              className="col-span-3 pr-2 border-r border-[#222222]/15 text-left"
            >
              <div className="text-xs text-[#555555] tabular-nums">{feedYear}年</div>
              <div className="text-lg font-bold leading-tight flex items-center gap-0.5 mt-0.5 tabular-nums">
                <span>{feedMonth}月</span>
                <span className="text-xs">▾</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSingleRankType('income');
                setSingleRankSort('amount');
                goScreen('singleRank');
              }}
              className="col-span-4 pl-3 text-left"
            >
              <div className="text-xs text-[#555555]">收入</div>
              <div className="text-lg font-bold leading-tight mt-0.5">
                <SplitMoney cents={monthTotals.inc} />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSingleRankType('expense');
                setSingleRankSort('amount');
                goScreen('singleRank');
              }}
              className="col-span-5 pl-2 text-left"
            >
              <div className="text-xs text-[#555555]">支出</div>
              <div className="text-lg font-bold leading-tight mt-0.5">
                <SplitMoney cents={monthTotals.exp} />
              </div>
            </button>
          </div>
        </header>

        {/* Shortcut Strip: 账单 | 预算 | 日历 | 固定 */}
        <div className="px-3 -mt-3 mb-2 z-20 relative">
          <div className="bg-white rounded-xl py-2.5 px-2 grid grid-cols-4 gap-1 shadow-sm border border-[#F0F0F0]">
            <button type="button" onClick={() => goScreen('bill')} className="flex flex-col items-center gap-1">
              <span className="w-7 h-7 rounded-lg shark-yellow-soft flex items-center justify-center text-sm">🧾</span>
              <span className="text-xs text-[#444444]">账单</span>
            </button>
            <button type="button" onClick={() => goScreen('budget')} className="flex flex-col items-center gap-1">
              <span className="w-7 h-7 rounded-lg shark-yellow-soft flex items-center justify-center text-sm">🎯</span>
              <span className="text-xs text-[#444444]">预算</span>
            </button>
            <button type="button" onClick={() => goScreen('calendar')} className="flex flex-col items-center gap-1">
              <span className="w-7 h-7 rounded-lg shark-yellow-soft flex items-center justify-center text-sm">📅</span>
              <span className="text-xs text-[#444444]">日历</span>
            </button>
            <button type="button" onClick={() => goScreen('recurring')} className="flex flex-col items-center gap-1">
              <span className="w-7 h-7 rounded-lg shark-yellow-soft flex items-center justify-center text-sm">📌</span>
              <span className="text-xs text-[#444444]">固定</span>
            </button>
          </div>
        </div>

        {/* Daily Feed */}
        <div className="flex-1 bg-white">
          {dates.length > 0 ? (
            dates.map((date) => {
              const items = grouped.get(date) || [];
              const dayExp = items
                .filter((t) => t.type === 'expense')
                .reduce((s, t) => s + t.amountCents, 0);
              const dayInc = items
                .filter((t) => t.type === 'income')
                .reduce((s, t) => s + t.amountCents, 0);
              const md = `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

              return (
                <div key={date}>
                  <div className="px-4 py-2 border-b border-[#F2F2F2] flex items-center justify-between text-xs text-[#999999]">
                    <span>
                      {md} {getWeekday(date)}
                    </span>
                    <span className="tabular-nums">
                      {dayInc > 0 ? `收入: ${fmtNum(dayInc)}` : ''}
                      {dayInc > 0 && dayExp > 0 ? '  ' : ''}
                      {dayExp > 0 ? `支出: ${fmtNum(dayExp)}` : ''}
                    </span>
                  </div>
                  <div>
                    {items.map((tx) => {
                      const cat = getCategory(tx.categoryId);
                      const title = tx.note ? tx.note : cat.name;
                      const isChecked = selectedIds.includes(tx.id);
                      const toggleSelect = () => {
                        setSelectedIds((prev) =>
                          prev.includes(tx.id) ? prev.filter((id) => id !== tx.id) : [...prev, tx.id],
                        );
                      };
                      return (
                        <div
                          key={tx.id}
                          onClick={() => {
                            if (batchMode) {
                              toggleSelect();
                            } else {
                              setContextTxId((prev) => (prev === tx.id ? null : tx.id));
                            }
                          }}
                          className={`px-4 py-3 flex items-center justify-between border-b border-[#F7F7F7] active:bg-[#FAFAFA] cursor-pointer relative ${
                            batchMode && isChecked ? 'bg-[#FFFDF0]' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {batchMode && (
                              <span
                                className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs shrink-0 transition-colors ${
                                  isChecked
                                    ? 'shark-yellow border-[#E5C100] text-[#222222] font-bold'
                                    : 'border-[#CCCCCC] bg-white'
                                }`}
                              >
                                {isChecked ? '✓' : ''}
                              </span>
                            )}
                            <span className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-base shrink-0">
                              {cat.icon}
                            </span>
                            <span className="text-sm text-[#222222] truncate">{title}</span>
                          </div>
                          <span className="text-sm font-medium tabular-nums shrink-0 text-[#222222]">
                            {tx.type === 'income' ? fmtNum(tx.amountCents) : `-${fmtNum(tx.amountCents)}`}
                          </span>

                          {!batchMode && contextTxId === tx.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute left-12 top-11 z-30 w-40 bg-white rounded-xl shadow-xl border border-[#EAEAEA] py-1 text-xs text-[#222222]"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setContextTxId(null);
                                  onDeleteTx(tx.id);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-[#F7F7F7] text-[#E53935]"
                              >
                                删除
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setContextTxId(null);
                                  setBatchMode(true);
                                  setSelectedIds([tx.id]);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-[#F7F7F7]"
                              >
                                批量选择
                              </button>
                              <button
                                type="button"
                                onClick={() => openAdd(tx)}
                                className="w-full text-left px-4 py-2.5 hover:bg-[#F7F7F7]"
                              >
                                修改
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setContextTxId(null);
                                  showToast(`分类：${cat.name} · 日期：${tx.date}`);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-[#F7F7F7]"
                              >
                                查看明细
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 px-6 text-center space-y-3">
              <div className="text-3xl">📝</div>
              <div className="text-xs text-[#999999]">
                {feedYear}年{feedMonth}月 暂无记账记录
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openAdd()}
                  className="px-4 py-2 rounded-xl shark-yellow text-xs font-bold text-[#222222]"
                >
                  + 记一笔
                </button>
                {transactions.length === 0 && (
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={onSeedSamples}
                    className="px-4 py-2 rounded-xl bg-[#F5F5F5] text-xs font-medium text-[#555555]"
                  >
                    填入示例数据
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {batchMode ? (
          <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#EFEFEF] px-4 pt-3 mobile-bottom-lift flex items-center justify-between shadow-lg">
            <button
              type="button"
              onClick={() => {
                const allIds = list.map((t) => t.id);
                const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
                setSelectedIds(allSelected ? [] : allIds);
              }}
              className="flex items-center gap-2 text-xs font-medium text-[#222222]"
            >
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                  list.length > 0 && list.every((t) => selectedIds.includes(t.id))
                    ? 'shark-yellow border-[#E5C100] font-bold'
                    : 'border-[#CCCCCC] bg-white'
                }`}
              >
                {list.length > 0 && list.every((t) => selectedIds.includes(t.id)) ? '✓' : ''}
              </span>
              <span>
                {list.length > 0 && list.every((t) => selectedIds.includes(t.id)) ? '取消全选' : '全选本月'}
              </span>
              <span className="text-[#888888] tabular-nums">({selectedIds.length})</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBatchMode(false);
                  setSelectedIds([]);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#F5F5F5] text-xs font-medium text-[#555555]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={selectedIds.length === 0 || syncing}
                onClick={() => setConfirmBatchDeleteOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#E53935] text-white text-xs font-bold disabled:opacity-40 tabular-nums"
              >
                删除 ({selectedIds.length})
              </button>
            </div>
          </div>
        ) : (
          renderBottomNav()
        )}

        {confirmBatchDeleteOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setConfirmBatchDeleteOpen(false)}
          >
            <div
              className="w-full max-w-xs bg-white rounded-2xl p-5 space-y-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-bold text-[#222222]">确认批量删除</div>
              <div className="text-xs text-[#666666] leading-relaxed">
                确定删除已选中的 <strong className="text-[#E53935]">{selectedIds.length}</strong> 条账单记录吗？删除后无法恢复。
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => setConfirmBatchDeleteOpen(false)}
                  className="py-2.5 rounded-xl bg-[#F5F5F5] font-medium text-[#555555]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const target = [...selectedIds];
                    setConfirmBatchDeleteOpen(false);
                    setSelectedIds([]);
                    setBatchMode(false);
                    await onBatchDeleteTx(target);
                  }}
                  className="py-2.5 rounded-xl bg-[#E53935] text-white font-bold"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}

        <MobilePickerSheet
          request={pickerReq}
          onClose={() => setPickerReq(null)}
          onConfirm={handlePickerConfirm}
        />
      </div>
    );
  }

  // ============================================
  // 2. CHARTS SCREEN (With Category Drill-down + Pure Consumption Toggle)
  // ============================================
  if (screen === 'charts') {
    const activeWeek = recentWeeks[chartWeekIdx] ?? recentWeeks[recentWeeks.length - 1];
    const data = buildRealChartData({
      transactions,
      type: chartType,
      scope: chartScope,
      weekOption: activeWeek,
      year: chartYear,
      month: chartMonth,
      todayStr,
      skipInvestment: excludeInvestment,
    });
    const maxRank = data.rankList.length ? data.rankList[0].cents : 1;

    const presetMonths: { y: number; m: number; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(todayYear, todayMonth - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      presetMonths.push({ y, m, label: i === 0 ? '本月' : i === 1 ? '上月' : `${pad2(m)}月` });
    }
    const isCustomMonth = !presetMonths.some((p) => p.y === chartYear && p.m === chartMonth);

    const presetYears = [
      { y: todayYear - 2, label: `${todayYear - 2}年` },
      { y: todayYear - 1, label: '去年' },
      { y: todayYear, label: '今年' },
    ];
    const isCustomYear = !presetYears.some((p) => p.y === chartYear);

    const periodSubtitle =
      chartScope === 'week'
        ? `${activeWeek.label}（${activeWeek.start.slice(5)} 起）`
        : chartScope === 'month'
        ? `${chartYear}年${chartMonth}月`
        : `${chartYear}年`;

    return (
      <div className="min-h-screen bg-white pb-36 flex flex-col relative">
        <header className="shark-yellow px-4 pt-3 pb-3 sticky top-0 z-20">
          <div className="flex items-center justify-between mb-2.5">
            <div className="w-16" />
            <button
              type="button"
              onClick={() => setChartTypeMenuOpen((v) => !v)}
              className="text-base font-semibold flex items-center gap-1 text-[#222222]"
            >
              <span>{chartType === 'expense' ? '支出' : '收入'}</span>
              <span className="text-xs">▾</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setExcludeInvestment((v) => !v);
                setExpandedChartCatId(null);
              }}
              className={`w-16 py-0.5 rounded-full text-[11px] font-medium text-center transition-colors ${
                excludeInvestment
                  ? 'bg-[#333333] text-white'
                  : 'bg-black/10 text-[#333333]'
              }`}
              title="切换是否排除黄金、基金、理财"
            >
              {excludeInvestment ? '纯消费' : '含投资'}
            </button>
          </div>
          <div className="grid grid-cols-3 rounded-lg overflow-hidden border border-[#333333] text-xs font-medium">
            {(
              [
                ['week', '周'],
                ['month', '月'],
                ['year', '年'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setChartScope(k);
                  setExpandedChartCatId(null);
                }}
                className={`py-1.5 transition-colors ${
                  chartScope === k ? 'shark-dark' : 'text-[#333333]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </header>

        {chartTypeMenuOpen && (
          <div
            className="fixed inset-0 top-12 z-30 bg-black/40"
            onClick={() => setChartTypeMenuOpen(false)}
          >
            <div className="bg-white divide-y divide-[#F0F0F0]" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setChartType('expense');
                  setChartTypeMenuOpen(false);
                  setExpandedChartCatId(null);
                }}
                className="w-full px-5 py-3.5 flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2.5">
                  <span>💰</span>支出
                </span>
                {chartType === 'expense' && <span className="font-bold">✓</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChartType('income');
                  setChartTypeMenuOpen(false);
                  setExpandedChartCatId(null);
                }}
                className="w-full px-5 py-3.5 flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2.5">
                  <span>📈</span>收入
                </span>
                {chartType === 'income' && <span className="font-bold">✓</span>}
              </button>
            </div>
          </div>
        )}

        {/* Clickable Sub-Period Strip */}
        {chartScope === 'week' && (
          <div className="flex items-center justify-between overflow-x-auto no-scrollbar border-b border-[#EFEFEF] px-2 text-xs text-[#888888]">
            {recentWeeks.map((w, idx) => (
              <button
                key={w.start}
                type="button"
                onClick={() => {
                  setChartWeekIdx(idx);
                  setExpandedChartCatId(null);
                }}
                className={`py-2 px-2.5 shrink-0 ${
                  idx === chartWeekIdx
                    ? 'text-[#222222] font-semibold border-b-2 border-[#333333]'
                    : ''
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        {chartScope === 'month' && (
          <div className="flex items-center justify-between border-b border-[#EFEFEF] px-2 text-xs text-[#888888] gap-1">
            <div className="flex items-center overflow-x-auto no-scrollbar flex-1">
              {presetMonths.map((p) => {
                const active = chartYear === p.y && chartMonth === p.m;
                return (
                  <button
                    key={`${p.y}-${p.m}`}
                    type="button"
                    onClick={() => {
                      setChartYear(p.y);
                      setChartMonth(p.m);
                      setExpandedChartCatId(null);
                    }}
                    className={`py-2 px-2.5 shrink-0 ${
                      active ? 'text-[#222222] font-semibold border-b-2 border-[#333333]' : ''
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => openPicker('chartYM')}
              className={`py-1 px-2 my-1 rounded-md shrink-0 text-xs tabular-nums ${
                isCustomMonth ? 'shark-yellow font-semibold text-[#222222]' : 'bg-[#F5F5F5] text-[#555555]'
              }`}
            >
              {isCustomMonth ? `${chartYear}/${chartMonth}月` : '自选 ▾'}
            </button>
          </div>
        )}

        {chartScope === 'year' && (
          <div className="flex items-center justify-between border-b border-[#EFEFEF] px-3 text-xs text-[#888888] gap-2">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
              {presetYears.map((p) => {
                const active = chartYear === p.y;
                return (
                  <button
                    key={p.y}
                    type="button"
                    onClick={() => {
                      setChartYear(p.y);
                      setExpandedChartCatId(null);
                    }}
                    className={`py-2 px-2.5 shrink-0 ${
                      active ? 'text-[#222222] font-semibold border-b-2 border-[#333333]' : ''
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => openPicker('chartYear')}
              className={`py-1 px-2 my-1 rounded-md shrink-0 text-xs tabular-nums ${
                isCustomYear ? 'shark-yellow font-semibold text-[#222222]' : 'bg-[#F5F5F5] text-[#555555]'
              }`}
            >
              {isCustomYear ? `${chartYear}年 ▾` : '自选年份 ▾'}
            </button>
          </div>
        )}

        <div className="flex-1">
          <div className="px-4 pt-3 pb-2 border-b border-[#F2F2F2]">
            <div className="flex items-center justify-between text-xs text-[#555555]">
              <span>
                总{chartType === 'expense' ? '支出' : '收入'}
                {excludeInvestment ? '（不含黄金/基金/理财）' : ''}:{' '}
                <span className="tabular-nums font-medium text-[#222222]">
                  {fmtNum(data.total, true)}
                </span>
              </span>
              <span className="text-[#999999] tabular-nums">{periodSubtitle}</span>
            </div>
            <div className="text-xs text-[#999999] mt-0.5 mb-2">
              平均值: <span className="tabular-nums">{fmtNum(data.avg, true)}</span>
            </div>
            <SharkLineChart points={data.points} avg={data.avg} />
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">
                {chartType === 'expense' ? '支出排行榜' : '收入排行榜'}
              </span>
              <span className="text-[11px] text-[#999999]">点击分类展开明细</span>
            </div>
            {data.rankList.length > 0 ? (
              <div className="space-y-3">
                {data.rankList.map((item) => {
                  const barW = Math.max(4, Math.round((item.cents / maxRank) * 100));
                  const isExpanded = expandedChartCatId === item.cat.id;
                  const catTxs = isExpanded
                    ? data.periodTransactions
                        .filter((t) => t.categoryId === item.cat.id)
                        .sort((a, b) => b.amountCents - a.amountCents)
                    : [];

                  return (
                    <div key={item.cat.id} className="rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedChartCatId((prev) => (prev === item.cat.id ? null : item.cat.id))
                        }
                        className="w-full flex items-center gap-3 py-1 text-left active:opacity-80"
                      >
                        <span className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-base shrink-0">
                          {item.cat.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[#222222] font-medium">
                              {item.cat.name}{' '}
                              <span className="text-[#888888] font-normal ml-1 tabular-nums">
                                {item.pct.toFixed(1)}% · {item.count}笔
                              </span>
                            </span>
                            <span className="tabular-nums text-[#222222] font-medium flex items-center gap-1">
                              <span>{fmtNum(item.cents)}</span>
                              <span className="text-[#AAAAAA] text-[10px]">
                                {isExpanded ? '▴' : '▾'}
                              </span>
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#F3F3F3] overflow-hidden">
                            <div
                              className="h-full rounded-full shark-yellow"
                              style={{ width: `${barW}%` }}
                            />
                          </div>
                        </div>
                      </button>

                      {isExpanded && catTxs.length > 0 && (
                        <div className="mt-2 ml-11 bg-[#FAFAFA] rounded-xl border border-[#F0F0F0] divide-y divide-[#EFEFEF]">
                          {catTxs.map((tx) => (
                            <div
                              key={tx.id}
                              onClick={() => openAdd(tx)}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs active:bg-[#F2F2F2] cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="text-[#222222] truncate">
                                  {tx.note || item.cat.name}
                                </div>
                                <div className="text-[11px] text-[#999999] tabular-nums">
                                  {tx.date}
                                </div>
                              </div>
                              <span className="font-semibold tabular-nums shrink-0 text-[#222222]">
                                {tx.type === 'income' ? '+' : '-'}
                                {fmtNum(tx.amountCents)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-[#AAAAAA]">
                该时间段暂无{chartType === 'expense' ? '支出' : '收入'}记录
              </div>
            )}
          </div>
        </div>

        {renderBottomNav()}
        <MobilePickerSheet
          request={pickerReq}
          onClose={() => setPickerReq(null)}
          onConfirm={handlePickerConfirm}
        />
      </div>
    );
  }

  // ============================================
  // 3. ADD / EDIT ENTRY SCREEN (With Recent Note Pills + 0ms Optimistic Save)
  // ============================================
  if (screen === 'add') {
    const activeCats = getCategoriesByType(entryType);
    const recentNotes = getRecentNotesForCategory(transactions, entryCatId, 6);
    const hasOp = /[+-]/.test(entryExpr);
    const preview = evalCalcExpr(entryExpr);
    const dateLabel =
      entryDate === todayStr
        ? '今天'
        : entryDate.startsWith(`${todayYear}-`)
        ? entryDate.slice(5)
        : entryDate.slice(2).replace(/-/g, '/');

    return (
      <div className="h-dvh bg-white flex flex-col text-[#222222]">
        <header className="shark-yellow px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
          {!editingTxId ? (
            <button
              type="button"
              onClick={() => handleSaveEntry(true)}
              className="text-xs font-medium text-[#333333] text-left"
            >
              再记一笔
            </button>
          ) : (
            <div className="w-12" />
          )}
          <div className="flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                setEntryType('expense');
                setEntryCatId(getCategoriesByType('expense')[0].id);
              }}
              className={`pb-1 ${
                entryType === 'expense' ? 'font-bold border-b-2 border-[#222222]' : 'text-[#555555]'
              }`}
            >
              支出
            </button>
            <button
              type="button"
              onClick={() => {
                setEntryType('income');
                setEntryCatId(getCategoriesByType('income')[0].id);
              }}
              className={`pb-1 ${
                entryType === 'income' ? 'font-bold border-b-2 border-[#222222]' : 'text-[#555555]'
              }`}
            >
              收入
            </button>
          </div>
          <button
            type="button"
            onClick={() => goScreen('feed')}
            className="text-xs text-[#333333] w-12 text-right"
          >
            取消
          </button>
        </header>

        {/* 4-column Circular Icon Grid */}
        <div className="flex-1 overflow-y-auto px-3 py-3.5">
          <div className="grid grid-cols-4 gap-y-3.5 gap-x-2">
            {activeCats.map((c) => {
              const sel = c.id === entryCatId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setEntryCatId(c.id)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-colors ${
                      sel ? 'shark-yellow shadow-sm' : 'bg-[#F5F5F5]'
                    }`}
                  >
                    {c.icon}
                  </span>
                  <span className={`text-xs ${sel ? 'font-semibold text-[#222222]' : 'text-[#555555]'}`}>
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Recent Notes + Note Input + Calculator Keypad */}
        <div className="border-t border-[#ECECEC] bg-[#F7F8FA] px-2.5 pt-2.5 mobile-bottom-lift space-y-2 shrink-0">
          {recentNotes.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-0.5">
              <span className="text-[11px] text-[#999999] shrink-0">常用备注:</span>
              {recentNotes.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEntryNote(n)}
                  className={`px-2.5 py-0.5 rounded-full text-xs shrink-0 border transition-colors ${
                    entryNote === n
                      ? 'shark-yellow border-[#E5C100] text-[#222222] font-medium'
                      : 'bg-white border-[#EAEAEA] text-[#555555]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          <div className="bg-white rounded-lg px-3 py-2 flex items-center justify-between gap-2 border border-[#EFEFEF]">
            <input
              type="text"
              value={entryNote}
              onChange={(e) => setEntryNote(e.target.value)}
              placeholder="备注：点击写备注..."
              className="flex-1 text-xs bg-transparent text-[#222222] placeholder:text-[#AAAAAA] focus:outline-none"
            />
            <div className="text-right shrink-0">
              <div className="text-lg font-bold tabular-nums">{entryExpr || '0.00'}</div>
              {hasOp && (
                <div className="text-xs text-[#888888] tabular-nums">= {fmtNum(preview, true)}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 select-none">
            {['7', '8', '9', 'DATE', '4', '5', '6', '+', '1', '2', '3', '-', '.', '0', 'BACK', 'DONE'].map(
              (k) => {
                if (k === 'DATE') {
                  return (
                    <button
                      key="DATE"
                      type="button"
                      onClick={() => openPicker('entryDate')}
                      className="h-11 rounded-lg bg-white border border-[#EAEAEA] text-xs font-medium flex items-center justify-center gap-1 active:bg-[#FFF8D6] tabular-nums"
                    >
                      <span>📅</span>
                      <span>{dateLabel}</span>
                    </button>
                  );
                }
                if (k === 'BACK') {
                  return (
                    <button
                      key="BACK"
                      type="button"
                      onClick={() => handleKeypad('BACK')}
                      className="h-11 rounded-lg bg-white border border-[#EAEAEA] text-sm active:bg-[#F2F2F2]"
                    >
                      ⌫
                    </button>
                  );
                }
                if (k === '+' || k === '-') {
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleKeypad(k)}
                      className="h-11 rounded-lg bg-white border border-[#EAEAEA] text-base font-semibold active:bg-[#F2F2F2]"
                    >
                      {k}
                    </button>
                  );
                }
                if (k === 'DONE') {
                  return (
                    <button
                      key="DONE"
                      type="button"
                      onClick={() => handleSaveEntry(false)}
                      className="h-11 rounded-lg shark-yellow text-xs font-bold text-[#222222] active:opacity-80"
                    >
                      完成
                    </button>
                  );
                }
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleKeypad(k)}
                    className="h-11 rounded-lg bg-white border border-[#EAEAEA] text-base font-medium tabular-nums active:bg-[#F2F2F2]"
                  >
                    {k}
                  </button>
                );
              },
            )}
          </div>
        </div>

        <MobilePickerSheet
          request={pickerReq}
          onClose={() => setPickerReq(null)}
          onConfirm={handlePickerConfirm}
        />
      </div>
    );
  }

  // ============================================
  // 4. BILL SCREEN (With Pure Consumption Toggle + 1949-2100 Year Picker)
  // ============================================
  if (screen === 'bill') {
    const months = getYearMonthRows(transactions, billYear, excludeInvestment);
    const yInc = months.reduce((s, m) => s + m.income, 0);
    const yExp = months.reduce((s, m) => s + m.expense, 0);
    const yBal = yInc - yExp;

    const yearsSummary = getAllYearRows(transactions, excludeInvestment);
    const allInc = yearsSummary.reduce((s, y) => s + y.income, 0);
    const allExp = yearsSummary.reduce((s, y) => s + y.expense, 0);
    const allBal = allInc - allExp;

    return (
      <div className="min-h-screen bg-white pb-36 flex flex-col text-[#222222]">
        <header className="px-4 py-3 flex items-center justify-between border-b border-[#F0F0F0] sticky top-0 bg-white z-20">
          {billTab === 'month' ? (
            <button
              type="button"
              onClick={() => openPicker('billYear')}
              className="text-sm font-semibold flex items-center gap-0.5 tabular-nums w-20 text-left"
            >
              <span>{billYear}年</span>
              <span className="text-xs">▾</span>
            </button>
          ) : (
            <span className="w-20" />
          )}

          <div className="flex rounded-lg border border-[#333333] overflow-hidden text-xs font-medium">
            <button
              type="button"
              onClick={() => setBillTab('month')}
              className={`px-3 py-1 ${billTab === 'month' ? 'shark-dark' : 'bg-white text-[#333333]'}`}
            >
              月账单
            </button>
            <button
              type="button"
              onClick={() => setBillTab('year')}
              className={`px-3 py-1 ${billTab === 'year' ? 'shark-dark' : 'bg-white text-[#333333]'}`}
            >
              年账单
            </button>
          </div>

          <button
            type="button"
            onClick={() => setExcludeInvestment((v) => !v)}
            className={`w-16 py-0.5 rounded-full text-[11px] font-medium text-center ${
              excludeInvestment ? 'bg-[#333333] text-white' : 'bg-[#F5F5F5] text-[#555555]'
            }`}
          >
            {excludeInvestment ? '纯消费' : '含投资'}
          </button>
        </header>

        <div className="p-3.5">
          <div
            className="rounded-2xl p-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#FFE259,#FFD23F)' }}
          >
            <div className="text-xs text-[#555555]">
              {billTab === 'month' ? `${billYear}年结余` : '总结余'}
              {excludeInvestment ? '（不含黄金/基金/理财）' : ''}
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1 mb-3">
              {fmtNum(billTab === 'month' ? yBal : allBal, true)}
            </div>
            <div className="flex items-center gap-6 text-xs text-[#333333] tabular-nums">
              <span>
                {billTab === 'month' ? '年收入' : '总收入'}{' '}
                <strong>{fmtNum(billTab === 'month' ? yInc : allInc, true)}</strong>
              </span>
              <span>
                {billTab === 'month' ? '年支出' : '总支出'}{' '}
                <strong>{fmtNum(billTab === 'month' ? yExp : allExp, true)}</strong>
              </span>
            </div>
            <div className="absolute right-3 bottom-1 text-6xl font-bold opacity-10 pointer-events-none select-none">
              ¥
            </div>
          </div>
        </div>

        {billTab === 'month' ? (
          months.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#999999] border-b border-[#F2F2F2]">
                  <th className="py-2 pl-4 text-left font-normal">月份</th>
                  <th className="py-2 text-right font-normal">月收入</th>
                  <th className="py-2 text-right font-normal">月支出</th>
                  <th className="py-2 pr-4 text-right font-normal">月结余</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5] tabular-nums">
                {months.map((m) => (
                  <tr
                    key={m.month}
                    onClick={() => {
                      setReportMonth(m.month);
                      goScreen('monthReport');
                    }}
                    className="active:bg-[#FAFAFA] cursor-pointer"
                  >
                    <td className="py-3 pl-4 font-semibold">{m.month}月</td>
                    <td className="py-3 text-right text-[#444444]">{fmtNum(m.income, true)}</td>
                    <td className="py-3 text-right text-[#444444]">{fmtNum(m.expense, true)}</td>
                    <td className="py-3 pr-4 text-right">
                      {fmtNum(m.income - m.expense, true)} <span className="text-[#CCCCCC] ml-1">›</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center text-xs text-[#AAAAAA]">{billYear}年暂无账单记录</div>
          )
        ) : yearsSummary.length > 0 ? (
          <>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#999999] border-b border-[#F2F2F2]">
                  <th className="py-2 pl-4 text-left font-normal">年份</th>
                  <th className="py-2 text-right font-normal">年收入</th>
                  <th className="py-2 text-right font-normal">年支出</th>
                  <th className="py-2 pr-4 text-right font-normal">年结余</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5] tabular-nums">
                {yearsSummary.map((y) => (
                  <tr
                    key={y.year}
                    onClick={() => {
                      setBillYear(y.year);
                      setBillTab('month');
                    }}
                    className="active:bg-[#FAFAFA] cursor-pointer"
                  >
                    <td className="py-3 pl-4 font-semibold">{y.year}年</td>
                    <td className="py-3 text-right text-[#444444]">{fmtNum(y.income, true)}</td>
                    <td className="py-3 text-right text-[#444444]">{fmtNum(y.expense, true)}</td>
                    <td className="py-3 pr-4 text-right">
                      {fmtNum(y.income - y.expense, true)} <span className="text-[#CCCCCC] ml-1">›</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-center text-xs text-[#AAAAAA] py-4">年账单为自然年 (1.1–12.31)</div>
          </>
        ) : (
          <div className="py-12 text-center text-xs text-[#AAAAAA]">暂无历史年度账单</div>
        )}

        {renderBottomNav()}
        <MobilePickerSheet
          request={pickerReq}
          onClose={() => setPickerReq(null)}
          onConfirm={handlePickerConfirm}
        />
      </div>
    );
  }

  // ============================================
  // 5. MONTH REPORT SUBPAGE
  // ============================================
  if (screen === 'monthReport') {
    const curTotals = getMonthTotals(transactions, billYear, reportMonth, excludeInvestment);
    const prevDate = new Date(billYear, reportMonth - 2, 1);
    const prevTotals = getMonthTotals(
      transactions,
      prevDate.getFullYear(),
      prevDate.getMonth() + 1,
      excludeInvestment,
    );
    const data = buildRealChartData({
      transactions,
      type: 'expense',
      scope: 'month',
      weekOption: recentWeeks[recentWeeks.length - 1],
      year: billYear,
      month: reportMonth,
      todayStr,
      skipInvestment: excludeInvestment,
    });
    const top5 = data.rankList.slice(0, 5);
    const otherCents = data.rankList.slice(5).reduce((s, i) => s + i.cents, 0);
    const slices = [
      ...top5,
      ...(otherCents > 0
        ? [
            {
              cat: { id: 'other', name: '其它', type: 'expense' as const, icon: '📦', color: '#CBD5E1' },
              cents: otherCents,
              count: 0,
              pct: curTotals.exp > 0 ? (otherCents / curTotals.exp) * 100 : 0,
            },
          ]
        : []),
    ];

    const r = 40;
    const cx = 50;
    const cy = 50;
    const circ = 2 * Math.PI * r;
    let off = 0;

    const prefix = getMonthPrefix(billYear, reportMonth);
    const top3Single = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          t.date.startsWith(prefix) &&
          (!excludeInvestment || !getCategory(t.categoryId).isInvestment),
      )
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 3);

    return (
      <div className="min-h-screen bg-[#F7F8FA] pb-20 text-[#222222] flex flex-col">
        <header className="bg-white px-4 py-3 flex items-center justify-between border-b border-[#EFEFEF] sticky top-0 z-20">
          <button type="button" onClick={() => goScreen('bill')} className="text-sm font-medium">
            ← 返回
          </button>
          <div className="text-sm font-bold">
            {billYear}年{reportMonth}月账单报告
          </div>
          <div className="w-10" />
        </header>

        <div className="p-3 space-y-3">
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">{reportMonth}月账单</span>
              {excludeInvestment && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#333333] text-white">
                  纯消费口径
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-[#F2F2F2]">
              <div>
                <div className="text-xs text-[#999999]">本月结余:</div>
                <div className="text-lg font-bold tabular-nums mt-0.5">
                  {fmtNum(curTotals.bal, true)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#999999]">上月结余:</div>
                <div className="text-lg font-semibold tabular-nums text-[#888888] mt-0.5">
                  {fmtNum(prevTotals.bal, true)}
                </div>
              </div>
            </div>
            <div className="space-y-2 text-xs tabular-nums">
              <div className="flex items-center gap-2">
                <span className="w-8 text-[#888888]">支出</span>
                <div className="flex-1 h-2 rounded-full bg-[#F5F5F5] overflow-hidden">
                  <div
                    className="h-full shark-yellow rounded-full"
                    style={{ width: curTotals.exp > 0 ? '100%' : '0%' }}
                  />
                </div>
                <span className="font-semibold w-16 text-right">{fmtNum(curTotals.exp, true)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-8 text-[#888888]">收入</span>
                <div className="flex-1 h-2 rounded-full bg-[#F5F5F5] overflow-hidden">
                  <div
                    className="h-full bg-[#22C55E] rounded-full"
                    style={{
                      width: `${
                        Math.max(curTotals.exp, curTotals.inc) > 0
                          ? Math.round((curTotals.inc / Math.max(curTotals.exp, curTotals.inc)) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="font-semibold w-16 text-right">{fmtNum(curTotals.inc, true)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="text-sm font-semibold">支出类别</div>
            {slices.length > 0 ? (
              <div className="flex items-center gap-3">
                <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
                  {slices.map((s) => {
                    const dash = (s.pct / 100) * circ;
                    const curOff = off;
                    off += dash;
                    return (
                      <circle
                        key={s.cat.id}
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill="none"
                        stroke={s.cat.color}
                        strokeWidth="14"
                        strokeDasharray={`${dash} ${circ - dash}`}
                        strokeDashoffset={-curOff}
                        transform={`rotate(-90 ${cx} ${cy})`}
                      />
                    );
                  })}
                </svg>
                <div className="flex-1 space-y-1.5 text-xs tabular-nums">
                  {slices.map((s) => (
                    <div key={s.cat.id} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ background: s.cat.color }} />
                        {s.cat.name}
                      </span>
                      <span className="text-[#888888]">{s.pct.toFixed(1)}%</span>
                      <span className="font-medium">{fmtNum(s.cents)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[#AAAAAA]">本月暂无支出</div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">支出排行</span>
              <button
                type="button"
                onClick={() => {
                  setFeedYear(billYear);
                  setFeedMonth(reportMonth);
                  setSingleRankType('expense');
                  goScreen('singleRank');
                }}
                className="text-xs text-[#888888]"
              >
                查看更多 ›
              </button>
            </div>
            {top3Single.length > 0 ? (
              <div className="space-y-3">
                {top3Single.map((tx, i) => {
                  const cat = getCategory(tx.categoryId);
                  return (
                    <div key={tx.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="font-bold w-4 text-center"
                          style={{ color: i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : '#B45309' }}
                        >
                          {i + 1}
                        </span>
                        <span className="w-7 h-7 rounded-full bg-[#F5F5F5] flex items-center justify-center">
                          {cat.icon}
                        </span>
                        <div>
                          <div className="font-medium text-[#222222]">{tx.note || cat.name}</div>
                          <div className="text-[#999999]">{tx.date.slice(5)}</div>
                        </div>
                      </div>
                      <span className="font-semibold tabular-nums">-{fmtNum(tx.amountCents)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[#AAAAAA]">暂无排行数据</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // 6. BUDGET SUBPAGE (Per-Month Override Support + Top-left Back Button)
  // ============================================
  if (screen === 'budget') {
    const mTotals = getMonthTotals(transactions, feedYear, feedMonth, false);
    const { limitCents, isOverride } = getEffectiveMonthlyBudget(budget, feedYear, feedMonth);
    const rem = limitCents - mTotals.exp;
    const remPct = limitCents > 0 ? Math.max(0, Math.round((rem / limitCents) * 100)) : 0;
    const r = 36;
    const cx = 44;
    const cy = 44;
    const circ = 2 * Math.PI * r;
    const dash = (remPct / 100) * circ;
    const prefix = getMonthPrefix(feedYear, feedMonth);
    const catEntries = Object.entries(budget.categories);

    return (
      <div className="min-h-screen bg-[#F7F8FA] pb-20 text-[#222222] flex flex-col">
        <header className="shark-yellow px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <button
            type="button"
            onClick={() => goScreen('feed')}
            className="text-base font-semibold text-[#222222] w-10 text-left"
          >
            ←
          </button>
          <div className="text-sm font-bold">
            {feedYear}年{feedMonth}月预算
          </div>
          <button
            type="button"
            onClick={() => {
              setBudgetInput((limitCents / 100).toFixed(2));
              setBudgetApplyMode(isOverride ? 'month' : 'default');
              setBudgetModalOpen(true);
            }}
            className="text-xs font-medium text-[#222222] w-10 text-right"
          >
            编辑
          </button>
        </header>

        <div className="p-3 space-y-3">
          <div className="bg-white rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{feedMonth}月总预算</span>
                {isOverride && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded shark-yellow-soft text-[#666666]">
                    本月专属
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                {isOverride && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextOverrides = { ...budget.monthlyOverrides };
                      delete nextOverrides[prefix];
                      onSaveBudget({ ...budget, monthlyOverrides: nextOverrides });
                    }}
                    className="text-[#888888] underline"
                  >
                    恢复默认
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setBudgetInput((limitCents / 100).toFixed(2));
                    setBudgetApplyMode('month');
                    setBudgetModalOpen(true);
                  }}
                  className="text-[#555555] font-medium"
                >
                  修改预算
                </button>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <svg width="88" height="88" viewBox="0 0 88 88">
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0F0F0" strokeWidth="8" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={rem < 0 ? '#EF4444' : '#FFDA44'}
                    strokeWidth="8"
                    strokeDasharray={`${dash} ${circ - dash}`}
                    transform={`rotate(-90 ${cx} ${cy})`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs text-[#999999]">剩余</span>
                  <span className="text-sm font-bold tabular-nums">{remPct}%</span>
                </div>
              </div>
              <div className="flex-1 space-y-2 text-xs tabular-nums">
                <div className="flex justify-between pb-1.5 border-b border-[#F2F2F2]">
                  <span className="font-medium text-[#222222]">剩余预算:</span>
                  <span className={`font-bold text-sm ${rem < 0 ? 'text-[#E53935]' : ''}`}>
                    {fmtNum(rem, true)}
                  </span>
                </div>
                <div className="flex justify-between text-[#888888]">
                  <span>本月预算:</span>
                  <span>{fmtNum(limitCents, true)}</span>
                </div>
                <div className="flex justify-between text-[#888888]">
                  <span>本月支出:</span>
                  <span>{fmtNum(mTotals.exp, true)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">分类预算</span>
              <button
                type="button"
                onClick={() => setCatBudgetModalOpen(true)}
                className="text-xs font-medium text-[#222222] px-2.5 py-1 rounded-lg shark-yellow"
              >
                + 添加分类预算
              </button>
            </div>
            {catEntries.length > 0 ? (
              <div className="space-y-3">
                {catEntries.map(([cid, lim]) => {
                  const c = getCategory(cid);
                  const spent = transactions
                    .filter((t) => t.date.startsWith(prefix) && t.type === 'expense' && t.categoryId === cid)
                    .reduce((s, t) => s + t.amountCents, 0);
                  const pct = lim > 0 ? Math.min(100, Math.round((spent / lim) * 100)) : 0;
                  return (
                    <div key={cid} className="space-y-1 text-xs tabular-nums">
                      <div className="flex justify-between items-center">
                        <span>
                          {c.icon} {c.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>
                            已用 {fmtNum(spent)} / {fmtNum(lim)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const nextCats = { ...budget.categories };
                              delete nextCats[cid];
                              onSaveBudget({ ...budget, categories: nextCats });
                            }}
                            className="text-[#E53935]"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[#F2F2F2] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: pct >= 100 ? '#EF4444' : '#FFDA44' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#AAAAAA]">未设置分类预算</div>
            )}
          </div>
        </div>

        {/* Edit Monthly Budget Dialog (Per-month vs Global Default) */}
        {budgetModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setBudgetModalOpen(false)}
          >
            <div
              className="w-full max-w-xs bg-white rounded-2xl p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-bold">修改月度预算（元）</div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setBudgetApplyMode('month')}
                  className={`py-1.5 rounded-lg border font-medium ${
                    budgetApplyMode === 'month'
                      ? 'shark-yellow border-[#E5C100] font-bold'
                      : 'bg-[#FAFAFA] border-[#EAEAEA] text-[#666666]'
                  }`}
                >
                  仅 {feedYear}年{feedMonth}月
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetApplyMode('default')}
                  className={`py-1.5 rounded-lg border font-medium ${
                    budgetApplyMode === 'default'
                      ? 'shark-yellow border-[#E5C100] font-bold'
                      : 'bg-[#FAFAFA] border-[#EAEAEA] text-[#666666]'
                  }`}
                >
                  每月默认预算
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm tabular-nums"
              />
              <div className="flex gap-2 justify-end text-xs">
                <button
                  type="button"
                  onClick={() => setBudgetModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#F5F5F5]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const n = parseFloat(budgetInput);
                    if (!Number.isNaN(n) && n >= 0) {
                      const cents = Math.round(n * 100);
                      if (budgetApplyMode === 'month') {
                        await onSaveBudget({
                          ...budget,
                          monthlyOverrides: { ...budget.monthlyOverrides, [prefix]: cents },
                        });
                      } else {
                        await onSaveBudget({ ...budget, monthlyCents: cents });
                      }
                      setBudgetModalOpen(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-lg shark-yellow font-bold"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Category Budget Dialog */}
        {catBudgetModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setCatBudgetModalOpen(false)}
          >
            <div
              className="w-full max-w-xs bg-white rounded-2xl p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-bold">添加分类预算</div>
              <select
                value={catBudgetId}
                onChange={(e) => setCatBudgetId(e.target.value)}
                className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="1"
                value={catBudgetInput}
                onChange={(e) => setCatBudgetInput(e.target.value)}
                placeholder="月预算金额（元）"
                className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm tabular-nums"
              />
              <div className="flex gap-2 justify-end text-xs">
                <button
                  type="button"
                  onClick={() => setCatBudgetModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#F5F5F5]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const n = parseFloat(catBudgetInput);
                    if (!Number.isNaN(n) && n > 0) {
                      await onSaveBudget({
                        ...budget,
                        categories: { ...budget.categories, [catBudgetId]: Math.round(n * 100) },
                      });
                      setCatBudgetModalOpen(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-lg shark-yellow font-bold"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // 7. RECURRING MONTHLY TEMPLATES SUBPAGE (One-click generate)
  // ============================================
  if (screen === 'recurring') {
    const templates = budget.recurringTemplates || [];
    const maxD = daysInMonth(feedYear, feedMonth);

    const handleAddTemplate = async (e: React.FormEvent) => {
      e.preventDefault();
      const n = parseFloat(recAmount);
      if (Number.isNaN(n) || n <= 0) {
        showToast('请输入大于 0 的金额');
        return;
      }
      const nextItem: RecurringTemplate = {
        id: `tpl_${Date.now()}`,
        type: recType,
        categoryId: recCatId,
        amountCents: Math.round(n * 100),
        note: recNote.trim(),
        dayOfMonth: Math.min(28, Math.max(1, Number(recDay) || 1)),
      };
      await onSaveBudget({
        ...budget,
        recurringTemplates: [...templates, nextItem],
      });
      setRecAmount('');
      setRecNote('');
      setRecAddOpen(false);
    };

    const handleApplyTemplates = async () => {
      if (templates.length === 0) return;
      const drafts: TxDraft[] = templates.map((tpl) => {
        const d = Math.min(tpl.dayOfMonth, maxD);
        return {
          type: tpl.type,
          categoryId: tpl.categoryId,
          amountCents: tpl.amountCents,
          date: `${feedYear}-${pad2(feedMonth)}-${pad2(d)}`,
          note: tpl.note || getCategory(tpl.categoryId).name,
        };
      });
      await onImportTx(drafts, true);
    };

    return (
      <div className="min-h-screen bg-[#F7F8FA] pb-20 text-[#222222] flex flex-col">
        <header className="shark-yellow px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <button
            type="button"
            onClick={() => goScreen('feed')}
            className="text-base font-semibold text-[#222222] w-10 text-left"
          >
            ←
          </button>
          <div className="text-sm font-bold">固定月账单</div>
          <button
            type="button"
            onClick={() => setRecAddOpen((v) => !v)}
            className="text-xs font-semibold text-[#222222] w-10 text-right"
          >
            {recAddOpen ? '收起' : '+ 新增'}
          </button>
        </header>

        <div className="p-3.5 space-y-3">
          {recAddOpen && (
            <form
              onSubmit={handleAddTemplate}
              className="bg-white rounded-2xl p-4 space-y-2.5 border border-[#FFDA44]"
            >
              <div className="text-xs font-bold">新增固定月账单模板</div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={recType}
                  onChange={(e) => {
                    const t = e.target.value as TxType;
                    setRecType(t);
                    setRecCatId(getCategoriesByType(t)[0].id);
                  }}
                  className="border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs"
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
                <select
                  value={recCatId}
                  onChange={(e) => setRecCatId(e.target.value)}
                  className="border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs"
                >
                  {getCategoriesByType(recType).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.01"
                  required
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  placeholder="金额（元）"
                  className="border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs tabular-nums"
                />
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={recDay}
                  onChange={(e) => setRecDay(e.target.value)}
                  placeholder="每月几号 (1-28)"
                  className="border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs tabular-nums"
                />
              </div>
              <input
                type="text"
                value={recNote}
                onChange={(e) => setRecNote(e.target.value)}
                placeholder="备注（如：房租、话费月租、黄金定投）"
                className="w-full border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl shark-yellow text-xs font-bold text-[#222222]"
              >
                保存模板
              </button>
            </form>
          )}

          <div className="bg-white rounded-2xl overflow-hidden border border-[#F0F0F0]">
            <div className="px-4 py-2.5 border-b border-[#F2F2F2] flex items-center justify-between text-xs">
              <span className="font-semibold text-[#333333]">已设模板（{templates.length} 项）</span>
              <span className="text-[#888888]">自动去重，不会重复入账</span>
            </div>
            {templates.length > 0 ? (
              <div className="divide-y divide-[#F5F5F5]">
                {templates.map((tpl) => {
                  const cat = getCategory(tpl.categoryId);
                  return (
                    <div key={tpl.id} className="px-4 py-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-base shrink-0">
                          {cat.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {tpl.note || cat.name}
                          </div>
                          <div className="text-[11px] text-[#999999]">
                            每月 {tpl.dayOfMonth} 日 · {cat.name}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold tabular-nums">
                          {tpl.type === 'income' ? '+' : '-'}
                          {fmtNum(tpl.amountCents)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onSaveBudget({
                              ...budget,
                              recurringTemplates: templates.filter((t) => t.id !== tpl.id),
                            })
                          }
                          className="text-xs text-[#E53935]"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-[#AAAAAA] space-y-2">
                <div>还没有固定账单模板</div>
                <div>适合添加房租、话费、水电、黄金/基金定投</div>
              </div>
            )}
          </div>

          {templates.length > 0 && (
            <button
              type="button"
              disabled={syncing}
              onClick={handleApplyTemplates}
              className="w-full py-3 rounded-xl shark-yellow text-sm font-bold text-[#222222] shadow-sm disabled:opacity-50"
            >
              一键生成 {feedYear}年{feedMonth}月 全部固定账单
            </button>
          )}
        </div>
      </div>
    );
  }

  // ============================================
  // 8. SINGLE TRANSACTION RANKING SUBPAGE
  // ============================================
  if (screen === 'singleRank') {
    const prefix = getMonthPrefix(feedYear, feedMonth);
    const list = transactions
      .filter((t) => t.type === singleRankType && t.date.startsWith(prefix))
      .sort((a, b) =>
        singleRankSort === 'amount'
          ? b.amountCents - a.amountCents
          : b.date.localeCompare(a.date),
      );
    const total = list.reduce((s, t) => s + t.amountCents, 0);
    const maxAmt = list.length ? Math.max(...list.map((t) => t.amountCents)) : 1;

    return (
      <div className="min-h-screen bg-white pb-20 text-[#222222] flex flex-col">
        <header className="px-4 py-3 flex items-center justify-between border-b border-[#F2F2F2] sticky top-0 bg-white z-20">
          <button type="button" onClick={() => goScreen('feed')} className="text-base font-medium">
            ←
          </button>
          <div className="text-sm font-semibold">
            {feedYear}年{feedMonth}月
          </div>
          <div className="w-5" />
        </header>

        <div className="py-4 text-center border-b border-[#F5F5F5]">
          <div className="text-xs text-[#888888]">
            本月总{singleRankType === 'expense' ? '支出' : '收入'}
          </div>
          <div className="text-3xl font-bold tabular-nums mt-1">{fmtNum(total, true)}</div>
        </div>

        <div className="px-4 py-2.5 flex items-center justify-between border-b border-[#F5F5F5]">
          <span className="text-xs font-semibold">
            单笔{singleRankType === 'expense' ? '支出' : '收入'}排行
          </span>
          <div className="flex bg-[#F5F5F5] rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSingleRankSort('amount')}
              className={`px-2.5 py-0.5 rounded-md ${
                singleRankSort === 'amount' ? 'bg-white font-semibold shadow-sm' : 'text-[#888888]'
              }`}
            >
              按金额
            </button>
            <button
              type="button"
              onClick={() => setSingleRankSort('time')}
              className={`px-2.5 py-0.5 rounded-md ${
                singleRankSort === 'time' ? 'bg-white font-semibold shadow-sm' : 'text-[#888888]'
              }`}
            >
              按时间
            </button>
          </div>
        </div>

        <div className="flex-1 px-4 py-3 space-y-3.5">
          {list.length > 0 ? (
            list.map((tx) => {
              const cat = getCategory(tx.categoryId);
              const pct = total > 0 ? ((tx.amountCents / total) * 100).toFixed(1) : '0.0';
              const w = Math.max(4, Math.round((tx.amountCents / maxAmt) * 100));
              return (
                <div
                  key={tx.id}
                  onClick={() => openAdd(tx)}
                  className="flex items-center gap-3 cursor-pointer active:opacity-75"
                >
                  <span className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-base shrink-0">
                    {cat.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium truncate">
                        {tx.note || cat.name}{' '}
                        <span className="text-[#888888] font-normal ml-1">{pct}%</span>
                      </span>
                      <span className="tabular-nums font-semibold shrink-0">
                        {fmtNum(tx.amountCents)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#F3F3F3] overflow-hidden mb-1">
                      <div className="h-full rounded-full shark-yellow" style={{ width: `${w}%` }} />
                    </div>
                    <div className="text-xs text-[#AAAAAA] tabular-nums">
                      {tx.date.replace(/-/, '年').replace(/-/, '月')}日
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-xs text-[#AAAAAA]">本月暂无记录</div>
          )}
        </div>
      </div>
    );
  }

  // ============================================
  // 9. CALENDAR SUBPAGE (Uses Per-Month Budget)
  // ============================================
  if (screen === 'calendar') {
    const totalDays = daysInMonth(calYear, calMonth);
    const firstWeekday = new Date(calYear, calMonth - 1, 1).getDay();
    const { limitCents } = getEffectiveMonthlyBudget(budget, calYear, calMonth);
    const dailyBudget = Math.round(limitCents / totalDays);

    const dayMap = new Map<string, { exp: number; inc: number }>();
    for (const tx of transactions) {
      const cur = dayMap.get(tx.date) ?? { exp: 0, inc: 0 };
      if (tx.type === 'expense') cur.exp += tx.amountCents;
      else cur.inc += tx.amountCents;
      dayMap.set(tx.date, cur);
    }

    const selTxs = transactions.filter((t) => t.date === calSelectedDate);
    const selExp = selTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0);
    const selInc = selTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amountCents, 0);

    return (
      <div className="min-h-screen bg-white text-[#222222] flex flex-col relative pb-20">
        <header className="shark-yellow px-4 py-2.5 flex items-center justify-between sticky top-0 z-20">
          <button type="button" onClick={() => goScreen('feed')} className="text-base font-semibold">
            ←
          </button>
          <button
            type="button"
            onClick={() => openPicker('calYM')}
            className="text-sm font-bold flex items-center gap-0.5 tabular-nums"
          >
            <span>
              {calYear}年{calMonth}月
            </span>
            <span className="text-xs">▾</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCalYear(todayYear);
              setCalMonth(todayMonth);
              setCalSelectedDate(todayStr);
            }}
            className="text-xs font-medium"
          >
            今天
          </button>
        </header>

        <div className="grid grid-cols-7 text-center text-xs text-[#888888] py-2 border-b border-[#F2F2F2]">
          {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 px-2 py-2 border-b border-[#F2F2F2]">
          {Array.from({ length: firstWeekday }, (_, i) => (
            <span key={`e-${i}`} />
          ))}
          {Array.from({ length: totalDays }, (_, idx) => {
            const d = idx + 1;
            const ds = `${calYear}-${pad2(calMonth)}-${pad2(d)}`;
            const info = dayMap.get(ds);
            const isSel = calSelectedDate === ds;
            const isOver = Boolean(info && info.exp > dailyBudget);
            const isUnder = Boolean(info && info.exp > 0 && info.exp <= dailyBudget);
            const bg = isOver ? '#FDECEC' : isUnder ? '#EAF8EE' : 'transparent';
            const subTxt = info
              ? info.exp > 0
                ? `-${fmtNum(info.exp)}`
                : `+${fmtNum(info.inc)}`
              : '';
            return (
              <button
                key={ds}
                type="button"
                onClick={() => setCalSelectedDate(ds)}
                className="h-11 rounded-lg flex flex-col items-center justify-center"
                style={{
                  background: bg,
                  border: isSel ? '1.5px solid #333333' : '1px solid transparent',
                }}
              >
                <span className="text-xs font-medium leading-none">
                  {ds === todayStr ? '今天' : d}
                </span>
                <span
                  className="text-[10px] mt-1 tabular-nums truncate max-w-full px-0.5"
                  style={{
                    color: isOver
                      ? '#E53935'
                      : info && info.inc > 0 && !info.exp
                      ? '#16A34A'
                      : '#666666',
                  }}
                >
                  {subTxt}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-2 flex items-center justify-between text-xs text-[#888888] bg-[#FAFAFA] border-b border-[#F0F0F0]">
          <span>日均预算: {fmtNum(dailyBudget)}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block bg-[#F7C6C6]" />
              超出预算
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block bg-[#BCE8C7]" />
              未超出预算
            </span>
          </div>
        </div>

        <div className="flex-1">
          <div className="px-4 py-2 border-b border-[#F2F2F2] flex justify-between text-xs text-[#999999]">
            <span>
              {Number(calSelectedDate.slice(5, 7))}月{Number(calSelectedDate.slice(8, 10))}日{' '}
              {getWeekday(calSelectedDate)}
            </span>
            <span className="tabular-nums">
              {selInc > 0 ? `收入: ${fmtNum(selInc)} ` : ''}
              {selExp > 0 ? `支出: ${fmtNum(selExp)}` : ''}
            </span>
          </div>
          {selTxs.length > 0 ? (
            selTxs.map((tx) => {
              const cat = getCategory(tx.categoryId);
              return (
                <div
                  key={tx.id}
                  onClick={() => openAdd(tx)}
                  className="px-4 py-3 flex items-center justify-between border-b border-[#F7F7F7] active:bg-[#FAFAFA]"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-base">
                      {cat.icon}
                    </span>
                    <span className="text-sm">{tx.note || cat.name}</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {tx.type === 'income' ? fmtNum(tx.amountCents) : `-${fmtNum(tx.amountCents)}`}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="py-10 text-center text-xs text-[#BBBBBB]">当日暂无记账记录</div>
          )}
        </div>

        <button
          type="button"
          onClick={() => openAdd(undefined, calSelectedDate)}
          className="fixed right-4 bottom-6 w-12 h-12 rounded-full shark-yellow shadow-md flex items-center justify-center text-2xl font-light text-[#222222]"
        >
          +
        </button>

        <MobilePickerSheet
          request={pickerReq}
          onClose={() => setPickerReq(null)}
          onConfirm={handlePickerConfirm}
        />
      </div>
    );
  }

  // ============================================
  // 10. EXPORT / IMPORT SCREEN (5 Columns + WeChat / Alipay Auto-Import)
  // ============================================
  const exportList = getExportList(exportScope);

  const handleMobileFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportFileName(file.name);
    const text = await readCsvFileText(file);
    const parsed = parseBookkeepingCsv(text);
    setImportPreview(parsed);
    if (parsed.items.length === 0) {
      showToast('未解析到有效记录，请检查 CSV 列格式');
    }
  };

  const handleMobileConfirmImport = async () => {
    if (!importPreview || importPreview.items.length === 0) return;
    const res = await onImportTx(importPreview.items, skipDuplicates);
    if (res) {
      setImportPreview(null);
      setImportFileName('');
      if (res.importedCount > 0) {
        goScreen('feed');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-36 text-[#222222] flex flex-col">
      <header className="shark-yellow px-4 pt-3 pb-3 sticky top-0 z-20 space-y-2.5">
        <div className="text-center text-sm font-bold">账单导入 / 导出</div>
        <div className="grid grid-cols-2 rounded-lg overflow-hidden border border-[#333333] text-xs font-medium">
          <button
            type="button"
            onClick={() => setDataTab('export')}
            className={`py-1.5 transition-colors ${
              dataTab === 'export' ? 'shark-dark' : 'text-[#333333]'
            }`}
          >
            导出账单
          </button>
          <button
            type="button"
            onClick={() => setDataTab('import')}
            className={`py-1.5 transition-colors ${
              dataTab === 'import' ? 'shark-dark' : 'text-[#333333]'
            }`}
          >
            导入账单
          </button>
        </div>
      </header>

      {dataTab === 'export' ? (
        <div className="p-3.5 space-y-3">
          <div className="bg-white rounded-2xl p-4 space-y-2.5 border border-[#F0F0F0]">
            <div className="text-xs font-semibold text-[#555555]">选择导出范围</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(
                [
                  ['month', `${feedYear}年${feedMonth}月`],
                  ['year', `${feedYear}年全年`],
                  ['all', '全部账单'],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setExportScope(k)}
                  className={`py-2 px-1 rounded-xl border text-center font-medium transition-colors ${
                    exportScope === k
                      ? 'shark-yellow border-[#E5C100] font-bold text-[#222222]'
                      : 'bg-[#FAFAFA] border-[#EAEAEA] text-[#666666]'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-2.5 border border-[#F0F0F0]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#555555]">导出字段（共 5 列）</span>
              <span className="text-xs text-[#888888] tabular-nums">共 {exportList.length} 条记录</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {['时间', '支出/收入', '用途', '金额', '备注'].map((col) => (
                <span
                  key={col}
                  className="px-2.5 py-1 rounded-lg shark-yellow-soft border border-[#F5E38A] font-medium text-[#333333]"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden border border-[#F0F0F0]">
            <div className="px-3.5 py-2.5 border-b border-[#F2F2F2] text-xs font-semibold text-[#555555]">
              导出预览（前 8 条）
            </div>
            {exportList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#FAFAFA] text-[#999999] border-b border-[#F2F2F2]">
                    <tr>
                      <th className="py-2 pl-3 font-normal whitespace-nowrap">时间</th>
                      <th className="py-2 px-1.5 font-normal whitespace-nowrap">收支</th>
                      <th className="py-2 px-1.5 font-normal whitespace-nowrap">用途</th>
                      <th className="py-2 px-1.5 text-right font-normal whitespace-nowrap">金额</th>
                      <th className="py-2 pr-3 pl-1.5 font-normal whitespace-nowrap">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5] tabular-nums">
                    {exportList.slice(0, 8).map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2 pl-3 text-[#666666] whitespace-nowrap">{tx.date.slice(5)}</td>
                        <td className="py-2 px-1.5 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] ${
                              tx.type === 'income'
                                ? 'bg-[#EAF8EE] text-[#16A34A]'
                                : 'bg-[#F5F5F5] text-[#444444]'
                            }`}
                          >
                            {tx.type === 'income' ? '收入' : '支出'}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 whitespace-nowrap">{getCategory(tx.categoryId).name}</td>
                        <td className="py-2 px-1.5 text-right font-medium whitespace-nowrap">
                          {fmtNum(tx.amountCents, true)}
                        </td>
                        <td className="py-2 pr-3 pl-1.5 max-w-[90px] truncate text-[#666666]">
                          {tx.note || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#AAAAAA]">当前范围暂无可导出记录</div>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleDownloadCsv(exportScope)}
            className="w-full py-3 rounded-xl shark-yellow text-sm font-bold text-[#222222] shadow-sm active:opacity-90"
          >
            立即导出 CSV 账单
          </button>
        </div>
      ) : (
        <div className="p-3.5 space-y-3">
          <div className="bg-white rounded-2xl p-4 space-y-3 border border-[#F0F0F0]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#555555]">上传 CSV 账单文件</span>
              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="text-xs text-[#666666] underline"
              >
                下载标准模板
              </button>
            </div>
            <p className="text-xs text-[#888888] leading-relaxed">
              自动识别：<strong>简账 5 列 CSV</strong>、<strong>微信支付官方账单</strong>、<strong>支付宝官方账单</strong>（自动过滤信用卡还款/提现/零钱通等内部流转并智能归类）。
            </p>

            <label className="block w-full py-5 px-4 rounded-xl border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] text-center cursor-pointer active:bg-[#FFF8D6]">
              <div className="text-xl mb-1">📂</div>
              <div className="text-xs font-semibold text-[#333333]">
                {importFileName ? `已选择：${importFileName}` : '点击选择 CSV 文件'}
              </div>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleMobileFileChange}
                className="hidden"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-[#555555] cursor-pointer">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
              />
              <span>自动跳过已存在的重复记录</span>
            </label>
          </div>

          {importPreview && (
            <div className="bg-white rounded-2xl overflow-hidden border border-[#F0F0F0]">
              <div className="px-3.5 py-2.5 border-b border-[#F2F2F2] flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="font-semibold text-[#333333]">
                  识别为【{importPreview.sourceName}】· 有效 {importPreview.items.length} 条
                </span>
                {importPreview.filteredTransfers > 0 && (
                  <span className="text-[#888888]">
                    已过滤还款/内部流转 {importPreview.filteredTransfers} 条
                  </span>
                )}
              </div>

              {importPreview.errors.length > 0 && (
                <div className="px-3.5 py-2 bg-[#FDECEC] text-[11px] text-[#B91C1C] space-y-0.5">
                  {importPreview.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}

              {importPreview.items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#FAFAFA] text-[#999999] border-b border-[#F2F2F2]">
                      <tr>
                        <th className="py-2 pl-3 font-normal whitespace-nowrap">时间</th>
                        <th className="py-2 px-1.5 font-normal whitespace-nowrap">收支</th>
                        <th className="py-2 px-1.5 font-normal whitespace-nowrap">用途</th>
                        <th className="py-2 px-1.5 text-right font-normal whitespace-nowrap">金额</th>
                        <th className="py-2 pr-3 pl-1.5 font-normal whitespace-nowrap">备注</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F5F5F5] tabular-nums">
                      {importPreview.items.slice(0, 8).map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 pl-3 text-[#666666] whitespace-nowrap">
                            {item.date.slice(5)}
                          </td>
                          <td className="py-2 px-1.5 whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] ${
                                item.type === 'income'
                                  ? 'bg-[#EAF8EE] text-[#16A34A]'
                                  : 'bg-[#F5F5F5] text-[#444444]'
                              }`}
                            >
                              {item.type === 'income' ? '收入' : '支出'}
                            </span>
                          </td>
                          <td className="py-2 px-1.5 whitespace-nowrap">
                            {getCategory(item.categoryId).name}
                          </td>
                          <td className="py-2 px-1.5 text-right font-medium whitespace-nowrap">
                            {fmtNum(item.amountCents, true)}
                          </td>
                          <td className="py-2 pr-3 pl-1.5 max-w-[90px] truncate text-[#666666]">
                            {item.note || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {importPreview && importPreview.items.length > 0 && (
            <button
              type="button"
              disabled={syncing}
              onClick={handleMobileConfirmImport}
              className="w-full py-3 rounded-xl shark-yellow text-sm font-bold text-[#222222] shadow-sm disabled:opacity-50"
            >
              {syncing ? '正在导入...' : `确认导入 ${importPreview.items.length} 条账单`}
            </button>
          )}
        </div>
      )}

      {renderBottomNav()}
    </div>
  );
}
