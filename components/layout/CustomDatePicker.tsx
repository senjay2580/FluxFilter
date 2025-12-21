import React, { useState, useMemo } from 'react';
import { DateFilter } from '../../types';
import { ChevronLeftIcon, ChevronRightIcon } from '../shared/Icons';
import type { VideoWithUploader } from '../../lib/database.types';

// 通用视频类型（支持旧格式和新格式）
type VideoItem = { createdAt?: Date; pubdate?: string | null; created_at?: string };

interface CustomDatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filter: DateFilter) => void;
  currentFilter: DateFilter;
  videos: VideoItem[] | VideoWithUploader[];
}

// 5级热力图颜色配置
const HEAT_LEVELS = [
  { min: 0, max: 0, bg: 'bg-white/5', label: '无视频' },
  { min: 1, max: 2, bg: 'bg-emerald-900/60', label: '1-2个' },
  { min: 3, max: 4, bg: 'bg-emerald-500/70', label: '3-4个' },
  { min: 5, max: 6, bg: 'bg-amber-500/80', label: '5-6个' },
  { min: 7, max: Infinity, bg: 'bg-red-500/90', label: '7+个' },
];

const getHeatLevel = (count: number) => {
  return HEAT_LEVELS.find(l => count >= l.min && count <= l.max) || HEAT_LEVELS[0];
};

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ isOpen, onClose, onApply, currentFilter, videos }) => {
  const today = new Date();
  // 默认选中今天的日期
  const initYear = currentFilter.year !== undefined ? currentFilter.year : today.getFullYear();
  const initMonth = currentFilter.month !== undefined ? currentFilter.month : today.getMonth();
  const initDay = currentFilter.day !== undefined ? currentFilter.day : today.getDate();

  const [currentMonth, setCurrentMonth] = useState(initMonth);
  const [currentYear, setCurrentYear] = useState(initYear);
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    // 默认选中今天
    currentFilter.year !== undefined && currentFilter.month !== undefined && currentFilter.day !== undefined
      ? new Date(currentFilter.year, currentFilter.month, currentFilter.day)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate())
  );

  // 当打开时重置到当前筛选或今天
  React.useEffect(() => {
    if (isOpen) {
      const year = currentFilter.year !== undefined ? currentFilter.year : today.getFullYear();
      const month = currentFilter.month !== undefined ? currentFilter.month : today.getMonth();
      const day = currentFilter.day !== undefined ? currentFilter.day : today.getDate();

      setCurrentYear(year);
      setCurrentMonth(month);

      if (currentFilter.year !== undefined && currentFilter.month !== undefined && currentFilter.day !== undefined) {
        setSelectedDate(new Date(currentFilter.year, currentFilter.month, currentFilter.day));
      } else {
        // 默认选中今天
        setSelectedDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
      }
    }
  }, [isOpen, currentFilter]);

  // 统计每天的视频数量（支持两种数据格式）
  const videoCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    videos.forEach((v: any) => {
      // 支持旧格式 (createdAt) 和新格式 (pubdate)
      const dateValue = v.pubdate || v.createdAt || v.created_at;
      if (!dateValue) return;

      const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
      // 使用本地时间，而不是 UTC 时间
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [videos]);

  // 生成当月日历
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startPadding = firstDay.getDay(); // 周日开始
    const days: (Date | null)[] = [];

    // 前置空白
    for (let i = 0; i < startPadding; i++) days.push(null);
    // 当月日期
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(currentYear, currentMonth, d));
    }
    return days;
  }, [currentMonth, currentYear]);

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onApply({ year: date.getFullYear(), month: date.getMonth(), day: date.getDate() });
    onClose();
  };

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    return selectedDate?.toDateString() === date.toDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-cyber-card border-t sm:border border-white/10 sm:rounded-2xl p-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ChevronLeftIcon className="w-5 h-5 text-gray-400" />
          </button>
          <h3 className="text-lg font-bold text-white">{currentYear}年 {monthNames[currentMonth]}</h3>
          <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ChevronRightIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 星期标题 */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(d => (
            <div key={d} className="text-center text-[10px] text-gray-500 py-1">{d}</div>
          ))}
        </div>

        {/* 日历网格 */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((date, idx) => {
            if (!date) return <div key={idx} className="aspect-square" />;

            // 使用本地时间生成 key（与 videoCountByDate 一致）
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;
            const count = videoCountByDate[dateKey] || 0;
            const heat = getHeatLevel(count);

            return (
              <button
                key={idx}
                onClick={() => handleDateClick(date)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-all text-xs relative
                  ${heat.bg}
                  ${isToday(date) ? 'ring-2 ring-cyber-lime' : ''}
                  ${isSelected(date) ? 'ring-2 ring-white' : ''}
                  hover:scale-110 hover:z-10
                `}
              >
                <span className={`font-medium ${count > 0 ? 'text-white' : 'text-gray-400'}`}>
                  {date.getDate()}
                </span>
                {count > 0 && (
                  <span className="text-[8px] text-white/80">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 图例 */}
        <div className="mt-4 pt-3 border-t border-white/10">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {HEAT_LEVELS.map((level, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded ${level.bg}`} />
                <span className="text-[10px] text-gray-400">{level.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="w-full mt-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  );
};

export default CustomDatePicker;
