'use client';

import { useMemo, useState } from 'react';
import {
  ALL_CATEGORIES,
  EXPENSE_CATEGORIES,
  getCategoriesByType,
  getCategory,
} from '@/lib/categories';
import {
  buildRealChartData,
  getAllYearRows,
  getMonthTotals,
  getYearMonthRows,
} from '@/lib/analytics';
import {
  daysInMonth,
  downloadCsv,
  fmtNum,
  getMonthPrefix,
  getRecentWeeks,
  getTodayStr,
  MAX_YEAR,
  MIN_YEAR,
  pad2,
  splitMoneyParts,
} from '@/lib/format';
import {
  downloadCsvTemplate,
  parseBookkeepingCsv,
  readCsvFileText,
  type CsvParseResult,
} from '@/lib/csvImport';
import type { BudgetSettings, Transaction, TxType } from '@/lib/types';
import type { TxDraft } from './BookkeepingApp';
import SharkLineChart from './SharkLineChart';

type DesktopTab = 'overview' | 'charts' | 'bill' | 'calendar' | 'budget';

interface Props {
  transactions: Transaction[];
  budget: BudgetSettings;
  storageMode: 'supabase' | 'local';
  pinEnabled: boolean;
  syncing: boolean;
  onCreateTx: (draft: TxDraft) => Promise<Transaction | null>;
  onUpdateTx: (id: number, patch: Partial<TxDraft>) => Promise<Transaction | null>;
  onDeleteTx: (id: number) => Promise<boolean>;
  onImportTx: (
    items: TxDraft[],
    skipDuplicates?: boolean,
  ) => Promise<{ importedCount: number; skippedDuplicates: number } | null>;
  onSaveBudget: (next: BudgetSettings) => Promise<boolean>;
  onSeedSamples: () => Promise<void>;
  onLogout: () => Promise<void>;
  showToast: (msg: string) => void;
}

const YEAR_OPTIONS: number[] = [];
for (let y = MAX_YEAR; y >= MIN_YEAR; y--) YEAR_OPTIONS.push(y);

function SplitMoney({ cents }: { cents: number }) {
  const { sign, intPart, decPart } = splitMoneyParts(cents);
  return (
    <span className="tabular-nums">
      {sign}
      {intPart}
      <span className="text-sm font-normal">.{decPart}</span>
    </span>
  );
}

export default function DesktopView({
  transactions,
  budget,
  storageMode,
  pinEnabled,
  syncing,
  onCreateTx,
  onUpdateTx,
  onDeleteTx,
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

  const [tab, setTab] = useState<DesktopTab>('overview');
  const [excludeInvestment, setExcludeInvestment] = useState(false);

  // Overview / Ledger period & filters
  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const [searchQ, setSearchQ] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  // Quick Add form
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [qaType, setQaType] = useState<TxType>('expense');
  const [qaCatId, setQaCatId] = useState<string>('c_shucai');
  const [qaAmount, setQaAmount] = useState('');
  const [qaDate, setQaDate] = useState(todayStr);
  const [qaNote, setQaNote] = useState('');

  // Charts state
  const [chartType, setChartType] = useState<TxType>('expense');
  const [chartScope, setChartScope] = useState<'week' | 'month' | 'year'>('month');
  const [chartWeekIdx, setChartWeekIdx] = useState(recentWeeks.length - 1);
  const [chartYear, setChartYear] = useState(todayYear);
  const [chartMonth, setChartMonth] = useState(todayMonth);

  // Bill state
  const [billTab, setBillTab] = useState<'month' | 'year'>('month');
  const [billYear, setBillYear] = useState(todayYear);

  // Budget editing
  const [totalBudgetDraft, setTotalBudgetDraft] = useState((budget.monthlyCents / 100).toFixed(2));
  const [newCatBudgetId, setNewCatBudgetId] = useState(EXPENSE_CATEGORIES[0].id);
  const [newCatBudgetYuan, setNewCatBudgetYuan] = useState('500');

  // Import CSV modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<CsvParseResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const monthTotals = getMonthTotals(transactions, viewYear, viewMonth, excludeInvestment);
  const prefix = getMonthPrefix(viewYear, viewMonth);

  const filteredList = useMemo(() => {
    return transactions.filter((t) => {
      if (!t.date.startsWith(prefix)) return false;
      if (excludeInvestment && getCategory(t.categoryId).isInvestment) return false;
      if (catFilter !== 'all' && t.categoryId !== catFilter) return false;
      if (searchQ.trim()) {
        const kw = searchQ.trim().toLowerCase();
        return (
          t.note.toLowerCase().includes(kw) ||
          getCategory(t.categoryId).name.toLowerCase().includes(kw)
        );
      }
      return true;
    });
  }, [transactions, prefix, excludeInvestment, catFilter, searchQ]);

  const overviewRank = useMemo(
    () =>
      buildRealChartData({
        transactions,
        type: 'expense',
        scope: 'month',
        weekOption: recentWeeks[recentWeeks.length - 1],
        year: viewYear,
        month: viewMonth,
        todayStr,
        skipInvestment: excludeInvestment,
      }).rankList,
    [transactions, recentWeeks, viewYear, viewMonth, todayStr, excludeInvestment],
  );

  const chartData = useMemo(
    () =>
      buildRealChartData({
        transactions,
        type: chartType,
        scope: chartScope,
        weekOption: recentWeeks[chartWeekIdx] ?? recentWeeks[recentWeeks.length - 1],
        year: chartYear,
        month: chartMonth,
        todayStr,
        skipInvestment: excludeInvestment,
      }),
    [
      transactions,
      chartType,
      chartScope,
      recentWeeks,
      chartWeekIdx,
      chartYear,
      chartMonth,
      todayStr,
      excludeInvestment,
    ],
  );

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(qaAmount);
    if (Number.isNaN(n) || n <= 0) {
      showToast('请输入大于 0 的金额');
      return;
    }
    const created = await onCreateTx({
      type: qaType,
      categoryId: qaCatId,
      amountCents: Math.round(n * 100),
      date: qaDate,
      note: qaNote.trim(),
    });
    if (!created) return;
    const [sy, sm] = qaDate.split('-').map(Number);
    if (sy && sm) {
      setViewYear(sy);
      setViewMonth(sm);
    }
    setQaAmount('');
    setQaNote('');
    setQuickAddOpen(false);
    showToast('已记一笔并同步');
  };

  const handleExport = (scope: 'month' | 'all') => {
    const list =
      scope === 'month'
        ? transactions.filter((t) => t.date.startsWith(prefix))
        : transactions;
    const filename =
      scope === 'month' ? `简账_${viewYear}年${viewMonth}月.csv` : '简账_全部账单.csv';
    downloadCsv(list, filename);
    showToast(`已导出 ${list.length} 条记录（时间/收支/用途/金额/备注）`);
  };

  const handleDesktopFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleDesktopConfirmImport = async () => {
    if (!importPreview || importPreview.items.length === 0) return;
    const res = await onImportTx(importPreview.items, skipDuplicates);
    if (res) {
      setImportPreview(null);
      setImportFileName('');
      setImportModalOpen(false);
    }
  };

  const presetMonths: { y: number; m: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(todayYear, todayMonth - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    presetMonths.push({ y, m, label: i === 0 ? '本月' : i === 1 ? '上月' : `${pad2(m)}月` });
  }

  const totalDaysInCal = daysInMonth(viewYear, viewMonth);
  const firstCalWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const dailyBudget = Math.round(budget.monthlyCents / totalDaysInCal);

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#222222]">
      {/* Top Desktop Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-[#EAEAEA] px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg shark-yellow flex items-center justify-center font-bold text-sm text-[#222222]">
              简
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">简账 · 电脑复盘工作台</div>
              <div className="text-xs text-[#888888] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#22C55E] inline-block" />
                <span>
                  {storageMode === 'supabase' ? 'Supabase 云端实时同步' : '本地持久化存储 (data/ledger.json)'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="bg-[#F7F8FA] border border-[#E5E5E5] rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
            <select
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="bg-[#F7F8FA] border border-[#E5E5E5] rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}月
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setQuickAddOpen((v) => !v)}
              className="px-3.5 py-1.5 rounded-lg shark-yellow text-xs font-bold text-[#222222] hover:opacity-90"
            >
              + 记一笔
            </button>

            {pinEnabled && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-xs text-[#666666] hover:bg-[#FAFAFA]"
              >
                锁定退出
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-5 flex gap-5">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 space-y-3">
          <div className="bg-white border border-[#EAEAEA] rounded-2xl p-2 space-y-1 shadow-sm">
            {(
              [
                ['overview', '📋', '明细与总览'],
                ['charts', '📈', '图表分析'],
                ['bill', '🧾', '月/年账单'],
                ['calendar', '📅', '日历复盘'],
                ['budget', '🎯', '预算管理'],
              ] as const
            ).map(([id, icon, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`w-full px-3 py-2.5 rounded-xl text-left text-xs flex items-center gap-2.5 transition-colors ${
                  tab === id
                    ? 'shark-yellow font-bold text-[#222222]'
                    : 'text-[#444444] font-medium hover:bg-[#FAFAFA]'
                }`}
              >
                <span>{icon}</span>
                <span>{lbl}</span>
              </button>
            ))}
          </div>

          <div className="bg-white border border-[#EAEAEA] rounded-2xl p-3.5 space-y-2.5 shadow-sm">
            <div className="text-xs font-semibold">复盘口径</div>
            <label className="flex items-start gap-2 cursor-pointer text-xs text-[#666666]">
              <input
                type="checkbox"
                checked={excludeInvestment}
                onChange={(e) => setExcludeInvestment(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="text-[#222222]">排除黄金/基金/理财</strong>
                <br />
                只看纯日常消费
              </span>
            </label>
          </div>

          <div className="bg-white border border-[#EAEAEA] rounded-2xl p-3.5 space-y-2 shadow-sm">
            <div className="text-xs font-semibold">导入 / 导出（5列）</div>
            <div className="text-[11px] text-[#888888]">时间 · 支出/收入 · 用途 · 金额 · 备注</div>
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="w-full py-2 rounded-xl bg-[#333333] text-white text-xs font-bold hover:opacity-90"
            >
              导入账单 CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport('month')}
              className="w-full py-2 rounded-xl shark-yellow text-xs font-bold text-[#222222] hover:opacity-90"
            >
              导出 {viewYear}年{viewMonth}月
            </button>
            <button
              type="button"
              onClick={() => handleExport('all')}
              className="w-full py-2 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#333333] hover:bg-[#FAFAFA]"
            >
              导出全部账单 CSV
            </button>
          </div>
        </aside>

        {/* Main Panel */}
        <main className="flex-1 min-w-0 space-y-4">
          {quickAddOpen && (
            <form
              onSubmit={handleQuickAddSubmit}
              className="bg-white border-2 border-[#FFDA44] rounded-2xl p-4 space-y-3 shadow-sm"
            >
              <div className="flex justify-between items-center text-sm font-bold">
                <span>电脑端记一笔</span>
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  className="text-xs text-[#888888]"
                >
                  关闭 ✕
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                <select
                  value={qaType}
                  onChange={(e) => {
                    const nextType = e.target.value as TxType;
                    setQaType(nextType);
                    setQaCatId(getCategoriesByType(nextType)[0].id);
                  }}
                  className="border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs"
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
                <select
                  value={qaCatId}
                  onChange={(e) => setQaCatId(e.target.value)}
                  className="border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs"
                >
                  {getCategoriesByType(qaType).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={qaAmount}
                  onChange={(e) => setQaAmount(e.target.value)}
                  placeholder="金额 (元)"
                  className="border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs tabular-nums"
                />
                <input
                  type="date"
                  value={qaDate}
                  min="1949-01-01"
                  max="2100-12-31"
                  onChange={(e) => setQaDate(e.target.value)}
                  className="border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs"
                />
              </div>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  value={qaNote}
                  onChange={(e) => setQaNote(e.target.value)}
                  placeholder="备注说明（选填）"
                  className="flex-1 border border-[#E5E5E5] rounded-lg px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={syncing}
                  className="px-5 py-2 rounded-lg shark-yellow text-xs font-bold text-[#222222] disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </form>
          )}

          {/* Yellow Top KPI Strip */}
          <div
            className="rounded-2xl p-5 grid grid-cols-4 gap-4 shadow-sm"
            style={{ background: 'linear-gradient(135deg,#FFE259,#FFD23F)' }}
          >
            <div>
              <div className="text-xs text-[#555555]">
                {viewYear}年{viewMonth}月 · 支出{excludeInvestment ? '（纯消费）' : ''}
              </div>
              <div className="text-2xl font-bold mt-1">
                <SplitMoney cents={monthTotals.exp} />
              </div>
            </div>
            <div>
              <div className="text-xs text-[#555555]">本月收入</div>
              <div className="text-2xl font-bold mt-1">
                <SplitMoney cents={monthTotals.inc} />
              </div>
            </div>
            <div>
              <div className="text-xs text-[#555555]">本月结余</div>
              <div className="text-2xl font-bold mt-1">
                <SplitMoney cents={monthTotals.bal} />
              </div>
            </div>
            <div>
              <div className="text-xs text-[#555555] flex justify-between">
                <span>月预算剩余</span>
                <button type="button" onClick={() => setTab('budget')} className="underline">
                  编辑
                </button>
              </div>
              <div className="text-2xl font-bold mt-1">
                <SplitMoney cents={budget.monthlyCents - monthTotals.exp} />
              </div>
            </div>
          </div>

          {/* TAB: OVERVIEW */}
          {tab === 'overview' && (
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-8 bg-white border border-[#EAEAEA] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-3.5 border-b border-[#F0F0F0] flex items-center gap-2.5">
                  <input
                    type="text"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="搜索备注或分类..."
                    className="flex-1 bg-[#F7F8FA] border border-[#EAEAEA] rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                  />
                  <select
                    value={catFilter}
                    onChange={(e) => setCatFilter(e.target.value)}
                    className="bg-[#F7F8FA] border border-[#EAEAEA] rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <option value="all">全部 {ALL_CATEGORIES.length} 个分类</option>
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name} ({c.type === 'expense' ? '支' : '收'})
                      </option>
                    ))}
                  </select>
                </div>

                {filteredList.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#FAFAFA] text-[#888888] border-b border-[#F0F0F0]">
                        <tr>
                          <th className="py-2.5 px-4 font-normal">日期</th>
                          <th className="py-2.5 px-3 font-normal">分类</th>
                          <th className="py-2.5 px-3 font-normal">备注（失焦自动保存）</th>
                          <th className="py-2.5 px-4 font-normal text-right">金额</th>
                          <th className="py-2.5 px-3 font-normal text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F5F5F5]">
                        {filteredList.map((tx) => {
                          const sameCats = getCategoriesByType(tx.type);
                          return (
                            <tr key={tx.id} className="hover:bg-[#FAFAFA]">
                              <td className="py-2.5 px-4 tabular-nums text-[#888888] whitespace-nowrap">
                                {tx.date}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <select
                                  value={tx.categoryId}
                                  onChange={(e) => onUpdateTx(tx.id, { categoryId: e.target.value })}
                                  className="bg-[#F7F8FA] border border-[#EAEAEA] rounded px-2 py-1 text-xs"
                                >
                                  {sameCats.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.icon} {c.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2.5 px-3">
                                <input
                                  type="text"
                                  defaultValue={tx.note}
                                  onBlur={(e) => {
                                    if (e.target.value.trim() !== tx.note) {
                                      onUpdateTx(tx.id, { note: e.target.value.trim() });
                                    }
                                  }}
                                  placeholder="—"
                                  className="w-full bg-transparent hover:bg-[#F5F5F5] focus:bg-[#F5F5F5] rounded px-1.5 py-0.5 text-xs focus:outline-none"
                                />
                              </td>
                              <td className="py-2.5 px-4 text-right font-semibold tabular-nums whitespace-nowrap">
                                {tx.type === 'income' ? '+' : '-'}
                                {fmtNum(tx.amountCents)}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => onDeleteTx(tx.id)}
                                  className="text-[#E53935] hover:underline"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-16 text-center space-y-3">
                    <div className="text-3xl">📝</div>
                    <div className="text-xs text-[#999999]">
                      {viewYear}年{viewMonth}月 暂无符合条件的账单
                    </div>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuickAddOpen(true)}
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

              {/* Right Category Ranking */}
              <div className="col-span-4 bg-white border border-[#EAEAEA] rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">本月支出排行榜</span>
                  <button
                    type="button"
                    onClick={() => setTab('charts')}
                    className="text-xs text-[#888888] hover:text-[#222222]"
                  >
                    看折线图 ›
                  </button>
                </div>
                {overviewRank.length > 0 ? (
                  <div className="space-y-3">
                    {overviewRank.slice(0, 8).map((item) => {
                      const w = Math.max(
                        4,
                        Math.round((item.cents / (overviewRank[0]?.cents || 1)) * 100),
                      );
                      return (
                        <div key={item.cat.id} className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-full bg-[#F5F5F5] flex items-center justify-center text-sm shrink-0">
                            {item.cat.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1">
                              <span>
                                {item.cat.name}{' '}
                                <span className="text-[#888888] ml-1">{item.pct.toFixed(1)}%</span>
                              </span>
                              <span className="tabular-nums font-semibold">{fmtNum(item.cents)}</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[#F2F2F2] overflow-hidden">
                              <div className="h-full rounded-full shark-yellow" style={{ width: `${w}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-[#AAAAAA]">本月暂无支出排行</div>
                )}
              </div>
            </div>
          )}

          {/* TAB: CHARTS */}
          {tab === 'charts' && (
            <div className="bg-white border border-[#EAEAEA] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChartType('expense')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                      chartType === 'expense' ? 'shark-yellow' : 'bg-[#F5F5F5] text-[#666666]'
                    }`}
                  >
                    支出
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartType('income')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                      chartType === 'income' ? 'shark-yellow' : 'bg-[#F5F5F5] text-[#666666]'
                    }`}
                  >
                    收入
                  </button>
                </div>

                <div className="grid grid-cols-3 rounded-lg overflow-hidden border border-[#333333] text-xs font-medium w-48">
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
                      onClick={() => setChartScope(k)}
                      className={`py-1 ${chartScope === k ? 'shark-dark' : 'bg-white text-[#333333]'}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clickable Period Bar */}
              {chartScope === 'week' && (
                <div className="flex items-center gap-2 border-b border-[#EFEFEF] text-xs text-[#888888]">
                  {recentWeeks.map((w, idx) => (
                    <button
                      key={w.start}
                      type="button"
                      onClick={() => setChartWeekIdx(idx)}
                      className={`py-2 px-3 ${
                        idx === chartWeekIdx
                          ? 'text-[#222222] font-semibold border-b-2 border-[#333333]'
                          : 'hover:text-[#222222]'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              )}

              {chartScope === 'month' && (
                <div className="flex items-center justify-between border-b border-[#EFEFEF] text-xs text-[#888888]">
                  <div className="flex items-center gap-1">
                    {presetMonths.map((p) => (
                      <button
                        key={`${p.y}-${p.m}`}
                        type="button"
                        onClick={() => {
                          setChartYear(p.y);
                          setChartMonth(p.m);
                        }}
                        className={`py-2 px-3 ${
                          chartYear === p.y && chartMonth === p.m
                            ? 'text-[#222222] font-semibold border-b-2 border-[#333333]'
                            : 'hover:text-[#222222]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 py-1">
                    <select
                      value={chartYear}
                      onChange={(e) => setChartYear(Number(e.target.value))}
                      className="bg-[#F5F5F5] rounded px-2 py-1 text-xs font-medium text-[#222222] tabular-nums"
                    >
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>
                          {y}年
                        </option>
                      ))}
                    </select>
                    <select
                      value={chartMonth}
                      onChange={(e) => setChartMonth(Number(e.target.value))}
                      className="bg-[#F5F5F5] rounded px-2 py-1 text-xs font-medium text-[#222222] tabular-nums"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {m}月
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {chartScope === 'year' && (
                <div className="flex items-center justify-between border-b border-[#EFEFEF] text-xs text-[#888888]">
                  <div className="flex items-center gap-2">
                    {[todayYear - 2, todayYear - 1, todayYear].map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setChartYear(y)}
                        className={`py-2 px-3 ${
                          chartYear === y
                            ? 'text-[#222222] font-semibold border-b-2 border-[#333333]'
                            : 'hover:text-[#222222]'
                        }`}
                      >
                        {y === todayYear ? '今年' : y === todayYear - 1 ? '去年' : `${y}年`}
                      </button>
                    ))}
                  </div>
                  <select
                    value={chartYear}
                    onChange={(e) => setChartYear(Number(e.target.value))}
                    className="bg-[#F5F5F5] rounded px-2 py-1 text-xs font-medium text-[#222222] tabular-nums"
                  >
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y}年
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="text-xs text-[#666666]">
                总{chartType === 'expense' ? '支出' : '收入'}:{' '}
                <strong className="text-[#222222] text-sm tabular-nums">
                  {fmtNum(chartData.total, true)}
                </strong>{' '}
                · 平均值: <span className="tabular-nums">{fmtNum(chartData.avg, true)}</span>
              </div>

              <SharkLineChart points={chartData.points} avg={chartData.avg} width={760} height={175} />

              <div className="pt-3 border-t border-[#F0F0F0]">
                {chartData.rankList.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {chartData.rankList.map((item) => {
                      const maxRank = chartData.rankList[0]?.cents || 1;
                      return (
                        <div key={item.cat.id} className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-base shrink-0">
                            {item.cat.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-medium">
                                {item.cat.name}{' '}
                                <span className="text-[#888888] font-normal ml-1">
                                  {item.pct.toFixed(1)}%
                                </span>
                              </span>
                              <span className="tabular-nums font-semibold">{fmtNum(item.cents)}</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[#F3F3F3] overflow-hidden">
                              <div
                                className="h-full rounded-full shark-yellow"
                                style={{ width: `${Math.max(4, Math.round((item.cents / maxRank) * 100))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs text-[#AAAAAA]">该时间段暂无记录</div>
                )}
              </div>
            </div>
          )}

          {/* TAB: BILL */}
          {tab === 'bill' && (
            <div className="bg-white border border-[#EAEAEA] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-bold">账单报表</h2>
                  {billTab === 'month' && (
                    <select
                      value={billYear}
                      onChange={(e) => setBillYear(Number(e.target.value))}
                      className="bg-[#F5F5F5] rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums"
                    >
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>
                          {y}年
                        </option>
                      ))}
                    </select>
                  )}
                </div>
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
              </div>

              {billTab === 'month' ? (
                (() => {
                  const rows = getYearMonthRows(transactions, billYear, excludeInvestment);
                  return rows.length > 0 ? (
                    <table className="w-full text-xs tabular-nums">
                      <thead className="bg-[#FAFAFA] text-[#888888] border-b border-[#F0F0F0]">
                        <tr>
                          <th className="py-2.5 px-4 text-left font-normal">月份</th>
                          <th className="py-2.5 px-4 text-right font-normal">月收入</th>
                          <th className="py-2.5 px-4 text-right font-normal">月支出</th>
                          <th className="py-2.5 px-4 text-right font-normal">月结余</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F5F5F5]">
                        {rows.map((m) => (
                          <tr
                            key={m.month}
                            onClick={() => {
                              setViewYear(billYear);
                              setViewMonth(m.month);
                              setTab('overview');
                            }}
                            className="hover:bg-[#FAFAFA] cursor-pointer"
                          >
                            <td className="py-3 px-4 font-semibold">{m.month}月</td>
                            <td className="py-3 px-4 text-right text-[#16A34A]">
                              {fmtNum(m.income, true)}
                            </td>
                            <td className="py-3 px-4 text-right">{fmtNum(m.expense, true)}</td>
                            <td className="py-3 px-4 text-right font-semibold">
                              {fmtNum(m.income - m.expense, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-12 text-center text-xs text-[#AAAAAA]">{billYear}年暂无账单</div>
                  );
                })()
              ) : (
                (() => {
                  const yRows = getAllYearRows(transactions, excludeInvestment);
                  return yRows.length > 0 ? (
                    <table className="w-full text-xs tabular-nums">
                      <thead className="bg-[#FAFAFA] text-[#888888] border-b border-[#F0F0F0]">
                        <tr>
                          <th className="py-2.5 px-4 text-left font-normal">年份</th>
                          <th className="py-2.5 px-4 text-right font-normal">年收入</th>
                          <th className="py-2.5 px-4 text-right font-normal">年支出</th>
                          <th className="py-2.5 px-4 text-right font-normal">年结余</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F5F5F5]">
                        {yRows.map((y) => (
                          <tr
                            key={y.year}
                            onClick={() => {
                              setBillYear(y.year);
                              setBillTab('month');
                            }}
                            className="hover:bg-[#FAFAFA] cursor-pointer"
                          >
                            <td className="py-3 px-4 font-semibold">{y.year}年</td>
                            <td className="py-3 px-4 text-right text-[#16A34A]">
                              {fmtNum(y.income, true)}
                            </td>
                            <td className="py-3 px-4 text-right">{fmtNum(y.expense, true)}</td>
                            <td className="py-3 px-4 text-right font-semibold">
                              {fmtNum(y.income - y.expense, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-12 text-center text-xs text-[#AAAAAA]">暂无年度账单</div>
                  );
                })()
              )}
            </div>
          )}

          {/* TAB: CALENDAR */}
          {tab === 'calendar' && (
            <div className="bg-white border border-[#EAEAEA] rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">
                  {viewYear}年{viewMonth}月 · 日预算复盘日历
                </h2>
                <div className="flex items-center gap-4 text-xs text-[#666666]">
                  <span>
                    日均预算：<strong>¥{fmtNum(dailyBudget)}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full inline-block bg-[#F7C6C6]" />
                    超预算
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full inline-block bg-[#BCE8C7]" />
                    未超预算
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs text-[#888888]">
                {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
                {Array.from({ length: firstCalWeekday }, (_, i) => (
                  <div key={`ce-${i}`} />
                ))}
                {Array.from({ length: totalDaysInCal }, (_, idx) => {
                  const d = idx + 1;
                  const ds = `${viewYear}-${pad2(viewMonth)}-${pad2(d)}`;
                  const dayTxs = transactions.filter(
                    (t) => t.date === ds && (!excludeInvestment || !getCategory(t.categoryId).isInvestment),
                  );
                  const exp = dayTxs
                    .filter((t) => t.type === 'expense')
                    .reduce((s, t) => s + t.amountCents, 0);
                  const inc = dayTxs
                    .filter((t) => t.type === 'income')
                    .reduce((s, t) => s + t.amountCents, 0);
                  const over = exp > dailyBudget;
                  const under = exp > 0 && exp <= dailyBudget;
                  return (
                    <div
                      key={ds}
                      className="h-20 rounded-xl p-2 text-left flex flex-col justify-between border border-[#F0F0F0]"
                      style={{ background: over ? '#FDECEC' : under ? '#EAF8EE' : '#FAFAFA' }}
                    >
                      <div className="font-semibold text-[#222222]">
                        {ds === todayStr ? `${d} · 今天` : d}
                      </div>
                      <div className="tabular-nums text-xs">
                        {exp > 0 && (
                          <div style={{ color: over ? '#E53935' : '#333333' }}>支 {fmtNum(exp)}</div>
                        )}
                        {inc > 0 && <div className="text-[#16A34A]">收 {fmtNum(inc)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: BUDGET */}
          {tab === 'budget' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-[#EAEAEA] rounded-2xl p-5 shadow-sm space-y-4">
                <h2 className="text-sm font-bold">月度总预算</h2>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={totalBudgetDraft}
                    onChange={(e) => setTotalBudgetDraft(e.target.value)}
                    className="flex-1 border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = parseFloat(totalBudgetDraft);
                      if (!Number.isNaN(n) && n >= 0) {
                        onSaveBudget({ ...budget, monthlyCents: Math.round(n * 100) });
                      }
                    }}
                    className="px-4 py-2 rounded-xl shark-yellow text-xs font-bold text-[#222222]"
                  >
                    保存总预算
                  </button>
                </div>
                <div className="text-xs text-[#666666] tabular-nums">
                  {viewYear}年{viewMonth}月已支出：<strong>¥{fmtNum(monthTotals.exp, true)}</strong> ·
                  剩余：<strong>¥{fmtNum(budget.monthlyCents - monthTotals.exp, true)}</strong>
                </div>
              </div>

              <div className="bg-white border border-[#EAEAEA] rounded-2xl p-5 shadow-sm space-y-4">
                <h2 className="text-sm font-bold">分类预算</h2>
                <div className="flex gap-2">
                  <select
                    value={newCatBudgetId}
                    onChange={(e) => setNewCatBudgetId(e.target.value)}
                    className="border border-[#E5E5E5] rounded-xl px-2.5 py-2 text-xs"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={newCatBudgetYuan}
                    onChange={(e) => setNewCatBudgetYuan(e.target.value)}
                    placeholder="预算(元)"
                    className="w-28 border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = parseFloat(newCatBudgetYuan);
                      if (!Number.isNaN(n) && n > 0) {
                        onSaveBudget({
                          ...budget,
                          categories: { ...budget.categories, [newCatBudgetId]: Math.round(n * 100) },
                        });
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl shark-yellow text-xs font-bold text-[#222222]"
                  >
                    添加
                  </button>
                </div>

                <div className="space-y-3">
                  {Object.entries(budget.categories).length > 0 ? (
                    Object.entries(budget.categories).map(([cid, lim]) => {
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
                                删除
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
                    })
                  ) : (
                    <div className="py-4 text-center text-xs text-[#AAAAAA]">暂未设置分类预算</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Desktop Import CSV Modal */}
      {importModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
          onClick={() => setImportModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-[#EAEAEA] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shark-yellow px-5 py-3.5 flex items-center justify-between">
              <div className="text-sm font-bold text-[#222222]">导入 CSV 账单</div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="text-xs font-medium text-[#333333]"
              >
                关闭 ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between text-xs text-[#666666]">
                <span>支持列：时间、支出/收入、用途、金额、备注（兼容 UTF-8 与 Excel GBK）</span>
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="text-[#222222] font-semibold underline shrink-0"
                >
                  下载标准模板 CSV
                </button>
              </div>

              <label className="block w-full py-6 px-4 rounded-xl border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] hover:bg-[#FFF8D6]/60 text-center cursor-pointer transition-colors">
                <div className="text-2xl mb-1">📂</div>
                <div className="text-xs font-semibold text-[#333333]">
                  {importFileName ? `已选择文件：${importFileName}` : '点击选择本地 CSV 账单文件'}
                </div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleDesktopFileChange}
                  className="hidden"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-[#555555] cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                />
                <span>自动跳过已存在的重复记录（按日期、收支、金额、用途与备注判重）</span>
              </label>

              {importPreview && (
                <div className="border border-[#EAEAEA] rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#FAFAFA] border-b border-[#EFEFEF] flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#222222]">
                      解析完成：有效 {importPreview.items.length} 条
                    </span>
                    {importPreview.skippedRows > 0 && (
                      <span className="text-[#E53935]">跳过异常 {importPreview.skippedRows} 行</span>
                    )}
                  </div>

                  {importPreview.errors.length > 0 && (
                    <div className="px-4 py-2 bg-[#FDECEC] text-xs text-[#B91C1C] space-y-0.5">
                      {importPreview.errors.map((err, i) => (
                        <div key={i}>{err}</div>
                      ))}
                    </div>
                  )}

                  {importPreview.items.length > 0 && (
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-[#FAFAFA] text-[#888888] border-b border-[#F0F0F0] sticky top-0">
                          <tr>
                            <th className="py-2 px-3 font-normal">时间</th>
                            <th className="py-2 px-3 font-normal">支出/收入</th>
                            <th className="py-2 px-3 font-normal">用途</th>
                            <th className="py-2 px-3 font-normal text-right">金额</th>
                            <th className="py-2 px-3 font-normal">备注</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F5F5F5] tabular-nums">
                          {importPreview.items.slice(0, 20).map((item, idx) => (
                            <tr key={idx}>
                              <td className="py-2 px-3 text-[#666666] whitespace-nowrap">{item.date}</td>
                              <td className="py-2 px-3 whitespace-nowrap">
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
                              <td className="py-2 px-3 whitespace-nowrap">
                                {getCategory(item.categoryId).icon} {getCategory(item.categoryId).name}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold whitespace-nowrap">
                                {fmtNum(item.amountCents, true)}
                              </td>
                              <td className="py-2 px-3 text-[#666666] max-w-[180px] truncate">
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

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#F5F5F5] text-xs font-medium text-[#555555]"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={syncing || !importPreview || importPreview.items.length === 0}
                  onClick={handleDesktopConfirmImport}
                  className="px-5 py-2 rounded-xl shark-yellow text-xs font-bold text-[#222222] disabled:opacity-40"
                >
                  {syncing
                    ? '导入中...'
                    : `确认导入${importPreview?.items.length ? ` ${importPreview.items.length} 条` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
