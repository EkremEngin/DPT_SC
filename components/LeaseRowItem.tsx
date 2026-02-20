
import React, { useState, memo } from 'react';
import { ExtendedLeaseData } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/format';
import Folder from '../components/Folder'; // Folder component must exist
import { AlertCircle, CheckCircle2, MapPin, Award, Trash2, ChevronRight } from 'lucide-react';

interface LeaseRowItemProps {
    item: ExtendedLeaseData;
    isSelected: boolean;
    onClick: () => void;
    onDelete: () => void;
}

export const LeaseRowItem: React.FC<LeaseRowItemProps> = memo(({ item, isSelected, onClick, onDelete }) => {
    const { isPresentationMode } = useTheme();
    const [isHovered, setIsHovered] = useState(false);
    // Fix: Treat empty unitId as pending (unallocated) even if lease exists
    const isPending = item.lease.id === 'PENDING' || !item.lease.unitId;
    const isDeparted = item.lease.id !== 'PENDING' && !item.lease.unitId;

    return (
        <div
            className={`grid grid-cols-12 gap-4 px-6 py-4 items-center rounded-xl border transition-all cursor-pointer group mb-3 shadow-sm ${isSelected ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 shadow-md' : 'bg-white border-gray-100 hover:border-indigo-200'}`}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="col-span-3 min-w-0 flex items-center gap-4">
                <div className="shrink-0">
                    <Folder color={isDeparted ? "#ef4444" : isPending ? "#fbbf24" : (isSelected ? "#ea580c" : "#f97316")} size={0.5} forceOpen={isHovered} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-gray-900 truncate">{item.company.name}</div>
                    <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{item.company.sector}</div>
                </div>
            </div>

            <div className="col-span-2 flex justify-center">
                {isDeparted ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-full">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-wide">AYRILAN FİRMA</span>
                    </div>
                ) : isPending ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-wide">TAHSİS EDİLMEDİ</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="text-[10px] font-black uppercase tracking-wide">TAHSİS EDİLDİ</span>
                    </div>
                )}
            </div>

            <div className="col-span-3 flex flex-col">
                <div className={`text-xs font-bold flex items-center gap-1.5 truncate ${isDeparted ? 'text-rose-600' : isPending ? 'text-amber-600' : 'text-gray-800'}`}>
                    <MapPin className="w-3 h-3 text-gray-400" /> {isDeparted ? 'Ayrılan Firma' : isPending ? 'Ofis Tahsisi Bekleniyor' : item.campus.name}
                </div>
                <div className={`text-[10px] font-bold truncate ${isDeparted ? 'text-rose-400' : isPending ? 'text-slate-500' : 'text-gray-500'}`}>
                    {isDeparted ? 'Tahsis Kaldırıldı' : isPending ? 'Yerleşim Yapılmadı' : `${item.block.name} • Kat ${item.unit.floor}`}
                </div>
            </div>
            <div className="col-span-2 flex flex-col text-center">
                <div className="text-xs font-black text-indigo-600">
                    {formatCurrency(item.lease.monthlyRent, isPresentationMode)} {isPending ? 'TL/m²' : 'TL'}
                </div>
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                    {isPending ? 'Birim Fiyat' : 'Aylık Kira'}
                </div>
            </div>
            <div className="col-span-2 flex items-center justify-end gap-3">
                <div className="flex flex-col items-center">
                    <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[11px] font-black border border-indigo-100 flex items-center gap-1">
                        <Award className="w-3 h-3" /> {item.company.score}
                    </div>
                    <div className="text-[8px] font-bold text-gray-400 uppercase mt-1">Karne Puanı</div>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-2 hover:bg-rose-50 text-gray-300 hover:text-rose-500 rounded-full transition-colors group-hover:block hidden"
                    title="Sözleşmeyi Sil"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
                <ChevronRight className={`w-5 h-5 text-gray-300 transition-transform ${isHovered ? 'translate-x-1 text-indigo-500' : ''}`} />
            </div>
        </div>
    );
});
