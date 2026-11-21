'use client';

import { useEffect, useRef, useState } from 'react';
import { addDays, daysInMonth, getTodayStr, MAX_YEAR, MIN_YEAR, pad2 } from '@/lib/format';

export type PickerKind = 'feedYM' | 'billYear' | 'chartYM' | 'chartYear' | 'calYM' | 'entryDate';

export interface PickerRequest {
  kind: PickerKind;
  year: number;
  month: number;
  day: number;
}

interface Props {
  request: PickerRequest | null;
  onClose: () => void;
  onConfirm: (kind: PickerKind, year: number, month: number, day: number) => void;
}

const YEARS: number[] = [];
for (let y = MIN_YEAR; y <= MAX_YEAR; y++) YEARS.push(y);

export default function MobilePickerSheet({ request, onClose, onConfirm }: Props) {
  const [year, setYear] = useState(request?.year ?? 2026);
  const [month, setMonth] = useState(request?.month ?? 11);
  const [day, setDay] = useState(request?.day ?? 1);
  const activeYearRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!request) return;
    setYear(request.year);
    setMonth(request.month);
    setDay(request.day);
    const id = setTimeout(() => {
      activeYearRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, 10);
    return () => clearTimeout(id);
  }, [request]);

  if (!request) return null;

  const todayStr = getTodayStr();
  const yesterdayStr = addDays(todayStr, -1);

  const handleYearChange = (y: number) => {
    const clamped = Math.min(MAX_YEAR, Math.max(MIN_YEAR, y));
    setYear(clamped);
    const maxD = daysInMonth(clamped, month);
    if (day > maxD) setDay(maxD);
  };

  const handleMonthChange = (m: number) => {
    setMonth(m);
    const maxD = daysInMonth(year, m);
    if (day > maxD) setDay(maxD);
  };

  if (request.kind === 'billYear' || request.kind === 'chartYear') {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
        <div
          className="w-full max-w-md bg-white rounded-t-2xl overflow-hidden text-[#222222] mobile-bottom-lift"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-[#F0F0F0] flex items-center justify-between text-sm">
            <button type="button" onClick={onClose} className="text-[#888888]">
              取消
            </button>
            <span className="font-semibold">选择年份 (1949–2100)</span>
            <button
              type="button"
              onClick={() => onConfirm(request.kind, year, month, day)}
              className="font-semibold text-[#222222]"
            >
              确定
            </button>
          </div>
          <div className="h-64 overflow-y-auto divide-y divide-[#F7F7F7]">
            {YEARS.map((y) => {
              const active = y === year;
              return (
                <button
                  key={y}
                  ref={active ? activeYearRef : null}
                  type="button"
                  onClick={() => handleYearChange(y)}
                  className={`w-full py-2.5 text-center tabular-nums transition-colors ${
                    active
                      ? 'text-base font-bold bg-[#FFF8D6] text-[#222222]'
                      : 'text-sm text-[#888888] hover:bg-[#FAFAFA]'
                  }`}
                >
                  {y}年
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (request.kind === 'feedYM' || request.kind === 'calYM' || request.kind === 'chartYM') {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
        <div
          className="w-full max-w-md bg-white rounded-t-2xl overflow-hidden text-[#222222] mobile-bottom-lift"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-[#F0F0F0] flex items-center justify-between text-sm">
            <button type="button" onClick={onClose} className="text-[#888888]">
              取消
            </button>
            <span className="font-semibold">选择年月 (1949–2100)</span>
            <button
              type="button"
              onClick={() => onConfirm(request.kind, year, month, 1)}
              className="font-semibold text-[#222222]"
            >
              确定
            </button>
          </div>
          <div className="grid grid-cols-12 h-64">
            <div className="col-span-5 border-r border-[#F0F0F0] overflow-y-auto">
              {YEARS.map((y) => {
                const active = y === year;
                return (
                  <button
                    key={y}
                    ref={active ? activeYearRef : null}
                    type="button"
                    onClick={() => handleYearChange(y)}
                    className={`w-full py-2 text-center text-xs tabular-nums ${
                      active
                        ? 'font-bold bg-[#FFF8D6] text-[#222222]'
                        : 'text-[#888888] hover:bg-[#FAFAFA]'
                    }`}
                  >
                    {y}年
                  </button>
                );
              })}
            </div>
            <div className="col-span-7 p-3 grid grid-cols-3 gap-2 content-center">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMonthChange(m)}
                  className={`py-2.5 rounded-xl text-xs font-medium tabular-nums transition-colors ${
                    m === month
                      ? 'shark-yellow font-bold text-[#222222]'
                      : 'bg-[#F7F8FA] text-[#555555] hover:bg-[#EFEFEF]'
                  }`}
                >
                  {m}月
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // entryDate
  const totalDays = daysInMonth(year, month);
  const firstWeekday = new Date(year, month - 1, 1).getDay();

  const pickQuick = (ds: string) => {
    const [y, m, d] = ds.split('-').map(Number);
    onConfirm('entryDate', y, m, d);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-t-2xl overflow-hidden text-[#222222] mobile-bottom-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#F0F0F0] flex items-center justify-between text-sm">
          <button type="button" onClick={onClose} className="text-[#888888]">
            取消
          </button>
          <span className="font-semibold">选择记账日期</span>
          <button
            type="button"
            onClick={() => onConfirm('entryDate', year, month, day)}
            className="font-semibold text-[#222222]"
          >
            确定
          </button>
        </div>

        <div className="px-3 py-2.5 bg-[#FAFAFA] border-b border-[#F0F0F0] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <select
              value={year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className="bg-white border border-[#E5E5E5] rounded-lg px-2 py-1 text-xs font-semibold tabular-nums"
            >
              {YEARS.slice().reverse().map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => handleMonthChange(Number(e.target.value))}
              className="bg-white border border-[#E5E5E5] rounded-lg px-2 py-1 text-xs font-semibold tabular-nums"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}月
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => pickQuick(todayStr)}
              className="px-2.5 py-1 rounded-md shark-yellow font-medium"
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => pickQuick(yesterdayStr)}
              className="px-2.5 py-1 rounded-md bg-white border border-[#E5E5E5] text-[#555555]"
            >
              昨天
            </button>
          </div>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-7 text-center text-xs text-[#999999] mb-1.5">
            {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`empty-${i}`} />
            ))}
            {Array.from({ length: totalDays }, (_, idx) => {
              const d = idx + 1;
              const ds = `${year}-${pad2(month)}-${pad2(d)}`;
              const sel = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onConfirm('entryDate', year, month, d)}
                  className={`h-9 rounded-lg text-xs tabular-nums transition-colors ${
                    sel
                      ? 'shark-yellow font-bold text-[#222222]'
                      : ds === todayStr
                      ? 'bg-[#FFF8D6] font-semibold text-[#222222]'
                      : 'hover:bg-[#F5F5F5] text-[#333333]'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
