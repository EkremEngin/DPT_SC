import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    X,
    AlertCircle
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { ExtendedLeaseData } from '../types';
import { formatCurrency } from '../utils/format';

interface ContractCalendarProps {
    leases: ExtendedLeaseData[];
}

export const ContractCalendar: React.FC<ContractCalendarProps> = ({ leases }) => {
    const { isPresentationMode } = useTheme();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isExpanded, setIsExpanded] = useState(false);

    // Group leases by Year-Month-Day for quick lookup
    const expiryMap = useMemo(() => {
        const map: Record<string, ExtendedLeaseData[]> = {};
        leases.forEach(l => {
            if (!l.lease.endDate) return;
            let dateStr = '';
            try {
                if (l.lease.endDate.includes('T')) {
                    dateStr = l.lease.endDate.split('T')[0];
                } else if (l.lease.endDate.includes('.')) {
                    const [d, m, y] = l.lease.endDate.split('.');
                    dateStr = `${y}-${m}-${d}`;
                } else {
                    dateStr = l.lease.endDate;
                }

                if (new Date(dateStr).toString() !== 'Invalid Date') {
                    if (!map[dateStr]) map[dateStr] = [];
                    map[dateStr].push(l);
                }
            } catch (e) {
                console.warn('Date parse error', l.lease.endDate);
            }
        });
        return map;
    }, [leases]);

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const generateCalendarDays = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sunday

        // Adjust for Monday start (Turkey standard)
        const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

        const days = [];
        for (let i = 0; i < startOffset; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        return days;
    };

    const days = generateCalendarDays(currentDate);
    // Format month name more nicely (e.g., "Ocak 2026")
    const monthName = currentDate.toLocaleString('tr-TR', { month: 'long', year: 'numeric' });
    const justMonth = currentDate.toLocaleString('tr-TR', { month: 'long' });
    const justYear = currentDate.getFullYear();

    const handlePrevMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const currentMonthExpiries = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        return leases.filter(l => {
            if (!l.lease.endDate) return false;
            let d = new Date(l.lease.endDate);
            if (isNaN(d.getTime())) {
                if (l.lease.endDate.includes('.')) {
                    const [day, m, y] = l.lease.endDate.split('.');
                    d = new Date(`${y}-${m}-${day}`);
                }
            }
            return d.getFullYear() === year && d.getMonth() === month;
        }).sort((a, b) => new Date(a.lease.endDate || '').getTime() - new Date(b.lease.endDate || '').getTime());
    }, [leases, currentDate]);

    const getDateKey = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    return (
        <>
            {/* Small Widget View - Compact Layout */}
            <div
                className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm h-full flex flex-col cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all duration-300 group relative overflow-hidden"
                onClick={() => setIsExpanded(true)}
            >
                {/* Compact Header */}
                <div className="flex justify-between items-center mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                            <CalendarIcon className="w-4 h-4" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-900 leading-tight">Sözleşme Takvimi</h3>
                            <p className="text-[10px] text-slate-500 font-medium leading-none">Bitiş Tarihleri</p>
                        </div>
                    </div>

                    <div className="flex flex-col items-center justify-center bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                        <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest leading-none">{justMonth}</span>
                        <span className="text-sm font-black text-indigo-600/90 leading-none">{justYear}</span>
                    </div>
                </div>

                {/* Compact Day Grid - Flex-1 to fill space evenly */}
                <div className="flex-1 flex flex-col justify-between min-h-0 border-t border-l border-slate-300 mt-2">
                    <div className="grid grid-cols-7 text-center border-b border-slate-300 bg-slate-100">
                        {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(d => (
                            <div key={d} className="text-[8px] font-bold text-slate-500 uppercase tracking-wider py-1 border-r border-slate-300">{d}</div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 flex-1 auto-rows-fr">
                        {days.map((day, idx) => {
                            if (!day) return <div key={idx} className="bg-slate-50/50 border-r border-b border-slate-300" />;
                            const dateKey = getDateKey(day);
                            const hasExpiry = expiryMap[dateKey];
                            const isToday = day.toDateString() === new Date().toDateString();

                            return (
                                <div key={idx} className={`flex flex-col items-center justify-center relative group/day border-r border-b border-slate-300 ${isToday ? 'bg-indigo-50/20' : ''}`}>
                                    {/* Expiry Background Layer */}
                                    {hasExpiry && !isToday && (
                                        <div className="absolute inset-0 bg-rose-50" />
                                    )}

                                    <div
                                        className={`
                                            w-6 h-6 flex items-center justify-center rounded-md text-xs font-bold transition-all duration-200 z-10
                                            ${isToday
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : hasExpiry
                                                    ? 'text-rose-600 font-extrabold' // Just bold text for compact, maybe red text? User liked red bg.
                                                    : 'text-slate-600'
                                            }
                                        `}
                                    >
                                        {day.getDate()}
                                    </div>

                                    {/* Small red indicator dot for compact view if we don't do full cell bg to keep it clean, 
                                        OR if user wants full grid maybe full cell bg is too much?
                                        User said "o gün kırmızı yansın". I will use full red bg for expiring days in grid too.
                                    */}
                                    {hasExpiry && (
                                        <div className="absolute inset-0 bg-rose-500/10 z-0" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>



            {/* Expanded Modal View */}
            {
                isExpanded && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col lg:flex-row overflow-hidden border border-white/20">

                            {/* Left: Large Calendar */}
                            <div className="flex-1 p-8 flex flex-col bg-white overflow-y-auto lg:overflow-visible relative">
                                <div className="flex justify-between items-center mb-8">
                                    <div>
                                        <h2 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                                            Bitiş Takvimi
                                        </h2>
                                        <p className="text-slate-500 font-medium text-sm mt-1">Sözleşmesi dolan firmaları takip edin</p>
                                    </div>

                                    <div className="flex items-center gap-6 bg-slate-50 p-1.5 pl-4 pr-1.5 rounded-full border border-slate-200/60 shadow-sm">
                                        <span className="text-sm font-bold text-slate-700 uppercase tracking-wide min-w-[100px] text-center">{monthName}</span>
                                        <div className="flex gap-1">
                                            <button onClick={handlePrevMonth} className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-900 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 transition-all shadow-sm">
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <button onClick={handleNextMonth} className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-900 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 transition-all shadow-sm">
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col min-h-0">
                                    <div className="grid grid-cols-7 mb-4">
                                        {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map(d => (
                                            <div key={d} className="text-xs font-black text-slate-500 uppercase tracking-wider text-center">{d}</div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 auto-rows-fr flex-1 border-t border-l border-slate-300 min-h-0">
                                        {days.map((day, idx) => {
                                            if (!day) return <div key={idx} className="bg-slate-50/30 border-r border-b border-slate-300" />;
                                            const dateKey = getDateKey(day);
                                            const expiries = expiryMap[dateKey];
                                            const isToday = day.toDateString() === new Date().toDateString();

                                            return (
                                                <div key={idx} className={`relative p-2 border-r border-b border-slate-300 flex flex-col transition-colors group overflow-hidden ${isToday ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                                                    <span className={`
                            w-7 h-7 flex items-center justify-center rounded-lg text-sm font-black mb-1 shrink-0
                            ${isToday
                                                            ? 'bg-indigo-600 text-white shadow-md'
                                                            : expiries
                                                                ? 'bg-rose-500 text-white shadow-md'
                                                                : 'text-slate-700 group-hover:text-slate-900'}
                        `}>
                                                        {day.getDate()}
                                                    </span>

                                                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                                                        {expiries?.map((exp, i) => (
                                                            <div key={i} className="text-[11px] font-bold px-2 py-1.5 rounded bg-rose-100 text-rose-800 border border-rose-200 truncate shadow-sm transition-transform hover:scale-105 cursor-default">
                                                                {exp.company.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Right: Side List - GRID LAYOUT */}
                            <div className="w-full lg:w-[450px] bg-slate-50 p-6 flex flex-col border-t lg:border-t-0 lg:border-l border-slate-300 h-1/3 lg:h-auto z-10 shadow-[-10px_0_40px_-20px_rgba(0,0,0,0.05)]">
                                <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-rose-600 animate-pulse ring-2 ring-rose-200" />
                                        <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">Bu Ay Bitenler</h3>
                                    </div>
                                    <button onClick={() => setIsExpanded(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500 hover:text-slate-800">
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                {/* Preview List as GRID */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2">
                                    {currentMonthExpiries.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-3">
                                            {currentMonthExpiries.map(item => (
                                                <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-300 shadow-sm flex flex-col gap-2 group hover:border-rose-400 transition-all hover:shadow-md hover:-translate-y-0.5">
                                                    <div className="flex justify-between items-start">
                                                        <div className="font-extrabold text-slate-900 line-clamp-1 text-sm" title={item.company.name}>{item.company.name}</div>
                                                    </div>

                                                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
                                                        <div className="text-[11px] font-bold bg-rose-100 text-rose-700 px-2 py-1 rounded-md border border-rose-200">
                                                            {new Date(item.lease.endDate).getDate()} {monthName.split(' ')[0]}
                                                        </div>
                                                        <div className="text-xs text-slate-600 font-bold">
                                                            {formatCurrency(item.lease.monthlyRent, isPresentationMode)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                                            <div className="bg-slate-200 p-4 rounded-full mb-3">
                                                <AlertCircle className="w-10 h-10 opacity-50 text-slate-500" />
                                            </div>
                                            <p className="text-base font-bold text-slate-600">Bu ay biten sözleşme bulunmuyor.</p>
                                            <p className="text-sm mt-1 opacity-80">Harikasınız! Her şey yolunda.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4 border-t border-slate-200 mt-4">
                                    <div className="flex justify-between text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100">
                                        <span className="text-rose-900">Toplam Bitiş:</span>
                                        <span className="text-rose-600">{currentMonthExpiries.length} Adet</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>,
                    document.body
                )
            }
        </>
    );
};
