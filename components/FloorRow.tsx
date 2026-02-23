import React, { useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { Block, FloorCapacity, Unit, Company } from '../types';
import { Layers, Building2, Clock, AlertTriangle, Trash2, Plus, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Button } from './Button';
import { motion } from 'motion/react';

interface FloorRowProps {
    block: Block;
    floorCap: FloorCapacity;
    currentUnits: Unit[];
    allCompanies: Company[];
    onRefresh: () => void;
    highlightedUnitId: string | null;
    onUnitClick: (unitId: string) => void;
    onEmptyClick: (blockId: string, floor: string) => void;
    onDeleteAllocation: (unitId: string) => Promise<void>;
}

export const FloorRow: React.FC<FloorRowProps> = memo(({
    block,
    floorCap,
    currentUnits,
    allCompanies,
    onRefresh,
    highlightedUnitId,
    onUnitClick,
    onEmptyClick,
    onDeleteAllocation
}) => {
    const allocations = currentUnits.filter(u => u.blockId === block.id && u.floor === floorCap.floor);
    const usedSqM = allocations.reduce((sum, a) => (a.status === 'OCCUPIED' || a.status === 'RESERVED' ? sum + a.areaSqM : sum), 0);
    const emptySqM = floorCap.totalSqM - usedSqM;
    const occupancy = floorCap.totalSqM > 0 ? (usedSqM / floorCap.totalSqM) * 100 : 0;

    const [isDeleting, setIsDeleting] = useState<{ id: string; companyName: string } | null>(null);
    const [confirmInput, setConfirmInput] = useState('');

    const getOccupancyTheme = (pct: number) => {
        if (pct >= 95) return { color: '#f43f5e', bg: 'bg-rose-500', text: 'text-rose-700', light: 'bg-rose-50' };
        if (pct >= 70) return { color: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-50' };
        return { color: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50' };
    };

    const theme = getOccupancyTheme(occupancy);

    const pieData = [
        { name: 'Dolu', value: usedSqM, color: theme.color },
        { name: 'Boş', value: Math.max(0, emptySqM), color: '#f1f5f9' }
    ];

    const handleConfirmDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDeleting && confirmInput === 'ONAYLIYORUM') {
            await onDeleteAllocation(isDeleting.id);
            onRefresh();
            setIsDeleting(null);
            setConfirmInput('');
        }
    };

    const handleDeleteClick = (id: string, companyName: string) => {
        setIsDeleting({ id, companyName });
        setConfirmInput('');
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-300 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
            <div className={`absolute left-0 top-0 bottom-0 w-2 ${theme.bg}`} />

            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                <div className="lg:col-span-8 p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
                        <div className="flex items-center gap-4">
                            <div className="min-w-10 min-h-10 sm:min-w-12 sm:min-h-12 w-auto h-auto px-2 py-1 rounded-xl bg-indigo-700 text-white flex flex-col items-center justify-center shadow-lg shadow-indigo-200">
                                <span className="text-[8px] sm:text-[9px] font-black uppercase leading-none opacity-80 mb-0.5">KAT</span>
                                <span className="text-sm sm:text-base font-black leading-none whitespace-nowrap">{floorCap.floor}</span>
                            </div>
                            <div>
                                <h4 className="font-extrabold text-gray-900 text-base sm:text-lg">{floorCap.floor}. Kat Yerleşimi</h4>
                                <div className="text-[10px] text-gray-600 font-extrabold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                                    <Layers className="w-3.5 h-3.5 text-indigo-600" /> {allocations.length} Atama
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {allocations.map(alloc => {
                            const company = allCompanies.find(c => c.id === alloc.companyId);
                            const isHighlighted = highlightedUnitId === alloc.id;
                            const companyName = company?.name || alloc.number || 'Belirtilmedi';
                            const isReserved = alloc.status === 'RESERVED';

                            const sqMPerEmp = block?.sqMPerEmployee ?? 5;
                            const minRequiredArea = (company?.employeeCount || 0) * sqMPerEmp;
                            const isOverCapacity = minRequiredArea > alloc.areaSqM;

                            return (
                                <div
                                    key={alloc.id}
                                    id={`unit-alloc-${alloc.id}`}
                                    onClick={() => onUnitClick(alloc.id)}
                                    className={`flex items-center justify-between p-4 rounded-xl border-2 group/item transition-all duration-300 cursor-pointer ${isHighlighted
                                        ? 'bg-orange-50/50 border-orange-500 ring-4 ring-orange-500/20 scale-[1.01] shadow-xl z-10'
                                        : isReserved ? 'bg-amber-50/50 border-amber-300 hover:border-amber-500' : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md'
                                        }`}
                                >
                                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                                        <div className={`p-2 sm:p-2.5 rounded-lg border-2 shadow-sm shrink-0 transition-colors ${isHighlighted ? 'bg-orange-500 text-white border-orange-600' : isReserved ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-50 border-slate-200 text-indigo-600 font-bold'}`}>
                                            {isReserved ? <Clock className="w-4 h-4 sm:w-5 sm:h-5" /> : <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <div className={`text-sm sm:text-base font-black truncate ${isHighlighted ? 'text-orange-900' : 'text-slate-800'}`}>{companyName}</div>
                                                {isOverCapacity && (
                                                    <div className="text-rose-600 bg-rose-100 p-0.5 rounded shrink-0 border border-rose-200" title="Kapasite Aşımı">
                                                        <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className={`text-[10px] sm:text-[11px] font-bold uppercase truncate mt-0.5 ${isHighlighted ? 'text-orange-800' : isReserved ? 'text-amber-700' : 'text-slate-500'}`}>{company?.sector || (isReserved ? 'REZERVE ALAN' : 'Sektör Belirtilmedi')}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 sm:gap-5 shrink-0 pl-3 border-l border-slate-100 ml-2">
                                        <div className="text-right">
                                            <div className={`text-xs sm:text-sm font-black ${isHighlighted ? 'text-orange-800' : 'text-indigo-700'}`}>{alloc.areaSqM} m²</div>
                                            <div className={`text-[9px] sm:text-[10px] uppercase font-black tracking-wide ${isHighlighted ? 'text-orange-600' : 'text-slate-400'}`}>{isReserved ? 'Rezerve' : 'Tahsis'}</div>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteClick(alloc.id, companyName);
                                            }}
                                            className={`p-2 transition-colors rounded-lg border content-center ${isHighlighted ? 'text-orange-600 border-orange-200 hover:bg-orange-100' : 'text-slate-400 border-slate-200 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200'}`}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {allocations.length === 0 && (
                            <div
                                onClick={() => onEmptyClick(block.id, floorCap.floor)}
                                className="text-center py-8 border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-[11px] font-black uppercase cursor-pointer hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all group"
                            >
                                <Plus className="w-6 h-6 mx-auto mb-2 opacity-20 group-hover:opacity-100 group-hover:text-indigo-500 transition-all" />
                                Henüz Atama Yapılmadı
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4 bg-slate-50/50 p-5 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-gray-50">
                    <div className="flex items-center gap-2 mb-4">
                        <Activity className={`w-3.5 h-3.5 ${theme.text}`} />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{floorCap.floor}. Kat Analizi</span>
                    </div>

                    <div className="flex items-center gap-4 sm:gap-6">
                        <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={30}
                                        outerRadius={45}
                                        paddingAngle={4}
                                        dataKey="value"
                                        animationBegin={200}
                                        animationDuration={1000}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className={`text-xs sm:text-sm font-black ${theme.text}`}>% {occupancy.toFixed(0)}</span>
                            </div>
                        </div>

                        <div className="flex-1 space-y-3">
                            <div className="bg-white p-3 rounded-xl border-2 border-slate-200 shadow-sm">
                                <div className="text-[10px] font-black text-slate-500 uppercase leading-none mb-1.5 tracking-wide">Kapasite</div>
                                <div className="text-sm sm:text-base font-black text-slate-900">{floorCap.totalSqM} m²</div>
                            </div>
                            <div className={`${theme.light} p-3 rounded-xl border-2 ${theme.bg === 'bg-emerald-500' ? 'border-emerald-200' : theme.bg === 'bg-amber-500' ? 'border-amber-200' : 'border-rose-200'} shadow-sm`}>
                                <div className={`text-[10px] font-black ${theme.text} uppercase leading-none mb-1.5 tracking-wide`}>Boş Alan</div>
                                <div className={`text-sm sm:text-base font-black ${theme.text}`}>{Math.max(0, emptySqM).toFixed(1)} m²</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isDeleting && createPortal(
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                    >
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
                                <Trash2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black text-gray-900 mb-2">Tahsis Silme Onayı</h3>
                            <p className="text-sm text-gray-600 font-medium px-4 mb-4">
                                <span className="font-black text-rose-600">{isDeleting.companyName}</span> şirketini bu kattan çıkarmak istediğinize emin misiniz?
                            </p>
                            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mb-4">
                                <p className="text-xs font-black text-amber-800 uppercase tracking-wide mb-2">Onaylamak için yazın:</p>
                                <p className="text-lg font-black text-amber-900 tracking-widest">ONAYLIYORUM</p>
                            </div>
                            <input
                                type="text"
                                value={confirmInput}
                                onChange={(e) => setConfirmInput(e.target.value)}
                                placeholder="ONAYLIYORUM yazın..."
                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-center font-black tracking-widest text-black focus:border-rose-500 focus:ring-2 focus:ring-rose-200 outline-none transition-all"
                                autoFocus
                            />
                        </div>
                        <div className="p-4 bg-gray-50 flex gap-3 border-t border-gray-100">
                            <Button variant="ghost" className="flex-1 font-bold text-gray-500" onClick={() => { setIsDeleting(null); setConfirmInput(''); }}>
                                Vazgeç
                            </Button>
                            <Button
                                variant="danger"
                                className="flex-1 font-bold shadow-lg shadow-rose-200"
                                onClick={handleConfirmDelete}
                                disabled={confirmInput !== 'ONAYLIYORUM'}
                            >
                                Onayla
                            </Button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

        </div>
    );
});
