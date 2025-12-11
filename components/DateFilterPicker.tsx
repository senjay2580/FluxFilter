import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DateFilter } from '../types';
import { CheckIcon } from './Icons';

interface DateFilterPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filter: DateFilter) => void;
  currentFilter: DateFilter;
}

const DateFilterPicker: React.FC<DateFilterPickerProps> = ({ isOpen, onClose, onApply, currentFilter }) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  const [selectedYear, setSelectedYear] = useState<number>(currentFilter.year || currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(currentFilter.month);
  const [selectedDay, setSelectedDay] = useState<number | undefined>(currentFilter.day);
  const [viewMode, setViewMode] = useState<'month' | 'day'>('month'); // 月份视图或日历视图
  
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  // 获取某月的天数
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // 获取某月第一天是周几
  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  // 生成日历格子
  const calendarDays = useMemo(() => {
    if (selectedMonth === undefined) return [];
    
    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
    const firstDay = getFirstDayOfMonth(selectedYear, selectedMonth);
    const days: (number | null)[] = [];
    
    // 填充空白
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // 填充日期
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  }, [selectedYear, selectedMonth]);

  // 判断是否是今天
  const isToday = (day: number) => {
    return selectedYear === currentYear && selectedMonth === currentMonth && day === currentDate.getDate();
  };

  // 判断是否是未来日期
  const isFuture = (day: number) => {
    if (selectedYear > currentYear) return true;
    if (selectedYear === currentYear && selectedMonth !== undefined && selectedMonth > currentMonth) return true;
    if (selectedYear === currentYear && selectedMonth === currentMonth && day > currentDate.getDate()) return true;
    return false;
  };

  // 选择月份
  const handleMonthSelect = (monthIdx: number) => {
    setSelectedMonth(monthIdx);
    setSelectedDay(undefined);
    setViewMode('day'); // 切换到日历视图
  };

  // 返回月份视图
  const handleBackToMonth = () => {
    setSelectedDay(undefined);
    setViewMode('month');
  };

  // 清除筛选
  const handleClear = () => {
    setSelectedYear(currentYear);
    setSelectedMonth(undefined);
    setSelectedDay(undefined);
    setViewMode('month');
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        style={{ animation: 'fadeIn 0.2s ease-out' }}
      />
      
      {/* 面板 */}
      <div 
        className="relative w-full max-w-md bg-gradient-to-b from-[#0f1015] to-[#080810] border-t sm:border border-white/10 sm:rounded-3xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* 顶部装饰 */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-cyber-lime/10 to-transparent pointer-events-none" />
        
        {/* 拖拽指示条 (移动端) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* 头部 */}
        <div className="relative px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {viewMode === 'day' && selectedMonth !== undefined && (
              <button
                onClick={handleBackToMonth}
                className="p-2 -ml-2 rounded-xl hover:bg-white/10 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
            )}
            <div>
              <h3 className="text-lg font-bold text-white">
                {viewMode === 'day' && selectedMonth !== undefined 
                  ? `${selectedYear}年${selectedMonth + 1}月` 
                  : '选择时间'}
              </h3>
              <p className="text-xs text-gray-500">
                {selectedDay !== undefined 
                  ? `已选择 ${selectedYear}/${selectedMonth !== undefined ? selectedMonth + 1 : ''}/${selectedDay}` 
                  : selectedMonth !== undefined 
                    ? `已选择 ${selectedYear}年${selectedMonth + 1}月`
                    : '选择年月或具体日期'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* 主体内容 */}
        <div className="relative px-5 pb-5">
          {/* 年份选择器 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
              </svg>
              <span className="text-xs text-cyber-lime font-medium uppercase tracking-wider">年份</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-1 px-1">
              {years.map(y => (
                <button
                  key={y}
                  onClick={() => { setSelectedYear(y); setSelectedMonth(undefined); setSelectedDay(undefined); setViewMode('month'); }}
                  className={`relative px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                    selectedYear === y 
                      ? 'bg-cyber-lime text-black shadow-lg shadow-cyber-lime/30' 
                      : 'bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {y}
                  {y === currentYear && selectedYear !== y && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-cyber-lime rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {viewMode === 'month' ? (
            /* 月份网格 */
            <div>
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span className="text-xs text-cyan-400 font-medium uppercase tracking-wider">月份</span>
              </div>
              
              {/* 全年选项 */}
              <button
                onClick={() => { setSelectedMonth(undefined); setSelectedDay(undefined); }}
                className={`w-full py-2.5 mb-3 rounded-xl text-sm font-medium transition-all duration-200 border ${
                  selectedMonth === undefined 
                    ? 'border-cyber-lime text-cyber-lime bg-cyber-lime/10' 
                    : 'border-white/10 text-gray-500 hover:border-white/20'
                }`}
              >
                全年
              </button>
              
              {/* 月份网格 */}
              <div className="grid grid-cols-4 gap-2">
                {months.map((m, idx) => {
                  const isFutureMonth = selectedYear === currentYear && idx > currentMonth;
                  return (
                    <button
                      key={m}
                      onClick={() => !isFutureMonth && handleMonthSelect(idx)}
                      disabled={isFutureMonth}
                      className={`py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                        selectedMonth === idx 
                          ? 'bg-gradient-to-br from-cyber-lime to-lime-500 text-black shadow-lg shadow-cyber-lime/20' 
                          : isFutureMonth
                            ? 'bg-white/[0.02] text-gray-700 cursor-not-allowed'
                            : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {idx + 1}月
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 日历视图 */
            <div>
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span className="text-xs text-purple-400 font-medium uppercase tracking-wider">选择日期（可选）</span>
              </div>
              
              {/* 仅选择月份 */}
              <button
                onClick={() => setSelectedDay(undefined)}
                className={`w-full py-2.5 mb-3 rounded-xl text-sm font-medium transition-all duration-200 border ${
                  selectedDay === undefined 
                    ? 'border-cyber-lime text-cyber-lime bg-cyber-lime/10' 
                    : 'border-white/10 text-gray-500 hover:border-white/20'
                }`}
              >
                整月
              </button>
              
              {/* 星期头 */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map(d => (
                  <div key={d} className="text-center text-xs text-gray-500 py-1">
                    {d}
                  </div>
                ))}
              </div>
              
              {/* 日期格子 */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => (
                  <button
                    key={idx}
                    onClick={() => day && !isFuture(day) && setSelectedDay(day)}
                    disabled={!day || isFuture(day)}
                    className={`aspect-square rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center ${
                      !day 
                        ? 'invisible' 
                        : selectedDay === day
                          ? 'bg-gradient-to-br from-cyber-lime to-lime-500 text-black shadow-lg shadow-cyber-lime/20'
                          : isToday(day)
                            ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/50'
                            : isFuture(day)
                              ? 'text-gray-700 cursor-not-allowed'
                              : 'bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-5 pb-5 pt-2 flex gap-3">
          <button 
            onClick={handleClear}
            className="flex-1 py-3.5 rounded-xl text-gray-400 font-medium bg-white/5 hover:bg-white/10 transition-colors"
          >
            清除
          </button>
          <button 
            onClick={() => {
              onApply({ year: selectedYear, month: selectedMonth, day: selectedDay });
              onClose();
            }}
            className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-cyber-lime to-lime-400 text-black font-bold hover:shadow-lg hover:shadow-cyber-lime/30 transition-all flex items-center justify-center gap-2"
          >
            <CheckIcon className="w-5 h-5" />
            应用筛选
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default DateFilterPicker;
