import React, { useState } from 'react';
import { DateFilter } from '../types';
import { CheckIcon } from './Icons';

interface DateFilterPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filter: DateFilter) => void;
  currentFilter: DateFilter;
}

const DateFilterPicker: React.FC<DateFilterPickerProps> = ({ isOpen, onClose, onApply, currentFilter }) => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentFilter.year || currentYear);
  const [month, setMonth] = useState<number | undefined>(currentFilter.month);
  
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-sm bg-cyber-card border-t sm:border border-white/10 sm:rounded-2xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-white">筛选时间范围</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">关闭</button>
        </div>

        <div className="space-y-6">
          {/* Year Selector */}
          <div>
            <label className="text-xs text-cyber-neon uppercase tracking-widest mb-2 block">年份</label>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {years.map(y => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${
                    year === y 
                      ? 'bg-cyber-lime text-black border-cyber-lime' 
                      : 'bg-white/5 text-gray-300 border-white/5 hover:border-cyber-lime/50'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Month Selector */}
          <div>
            <label className="text-xs text-cyber-neon uppercase tracking-widest mb-2 block">月份（可选）</label>
            <div className="grid grid-cols-4 gap-2">
              <button
                 onClick={() => setMonth(undefined)}
                 className={`col-span-4 py-1.5 text-xs mb-2 rounded-lg border ${month === undefined ? 'border-cyber-lime text-cyber-lime bg-cyber-lime/10' : 'border-white/10 text-gray-500'}`}
              >
                  全年
              </button>
              {months.map((m, idx) => (
                <button
                  key={m}
                  onClick={() => setMonth(idx)}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors border ${
                    month === idx 
                      ? 'bg-cyber-lime/20 text-cyber-lime border-cyber-lime' 
                      : 'bg-white/5 text-gray-300 border-white/5'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button 
          onClick={() => {
            onApply({ year, month });
            onClose();
          }}
          className="w-full mt-6 bg-cyber-lime text-black font-bold py-3 rounded-xl hover:bg-lime-400 transition-colors flex items-center justify-center gap-2"
        >
          <CheckIcon className="w-5 h-5" />
          应用筛选
        </button>
      </div>
    </div>
  );
};

export default DateFilterPicker;
