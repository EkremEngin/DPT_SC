import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { Campus, Block, Unit, Company, FloorCapacity } from '../types';
import { useDebounce } from '../utils/hooks';
import { triggerDataChange } from '../utils/events';

// Helper function that was in db.ts
const sanitizeInput = (input: any): any => {
    if (typeof input === 'string') {
        return input.trim().replace(/<[^>]*>/g, '');
    }
    if (typeof input === 'object' && input !== null) {
        const sanitized: any = {};
        for (const key in input) {
            sanitized[key] = sanitizeInput(input[key]);
        }
        return sanitized;
    }
    return input;
};
import { Plus, Minus, MapPin, Building, X, Check, Search, Layers, Trash2, AlertCircle, Building2, ArrowRight, Activity, ShieldAlert, Edit3, Save, User, Phone, Mail, LayoutGrid, ChevronRight, Clock, DollarSign, CalendarClock, Info, PieChart as PieIcon, Divide, ArrowDownToLine, Filter, Briefcase, BarChart3, AlertTriangle, Users, Calculator, Calendar, Loader2 } from 'lucide-react';
import { Button } from '../components/Button';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Dropdown } from '../components/Dropdown';

const sortFloors = (a: string, b: string) => {
    const parseFloor = (f: string) => {
        if (f === 'Zemin Asma') return 0.5;
        const num = parseFloat(f);
        if (isNaN(num)) return 0;
        if (f.endsWith('A')) return num + 0.5;
        return num;
    };
    return parseFloor(b) - parseFloor(a);
};

// --- Sub-component: FloorRow ---
interface FloorRowProps {
    block: Block;
    floorCap: FloorCapacity;
    currentUnits: Unit[];
    allCompanies: Company[];
    onRefresh: () => void;
    highlightedUnitId: string | null;
    onUnitClick: (unitId: string) => void;
    onEmptyClick: (blockId: string, floor: string) => void;
}

const FloorRow: React.FC<FloorRowProps> = React.memo(({ block, floorCap, currentUnits, allCompanies, onRefresh, highlightedUnitId, onUnitClick, onEmptyClick }) => {
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
            await api.removeAllocation(isDeleting.id);
            // Trigger event for Dashboard to refresh
            triggerDataChange('unit', 'update');
            await onRefresh();
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
                            // Use company data from the unit response (from JOIN) or fall back to lookup
                            const company = alloc.company || allCompanies.find(c => c.id === alloc.companyId);
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

import { formatCurrency } from '../utils/format';

const isoToDisplay = (iso: string) => {
    if (!iso || isNaN(new Date(iso).getTime())) return '';
    return new Date(iso).toLocaleDateString('tr-TR');
};

const convertToISO = (dateStr: string) => {
    if (!dateStr || dateStr.length !== 10) return '';
    const [day, month, year] = dateStr.split('.');
    return `${year}-${month}-${day}`;
};

const formatDateInput = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 4) return `${numbers.slice(0, 2)}.${numbers.slice(2)}`;
    return `${numbers.slice(0, 2)}.${numbers.slice(2, 4)}.${numbers.slice(4, 8)}`;
};

export const PhysicalStructure: React.FC = () => {
    const { backgroundMode, isPresentationMode } = useTheme();
    const isLight = backgroundMode === 'LIGHT';

    const [campuses, setCampuses] = useState<Campus[]>([]);
    const [selectedCampus, setSelectedCampus] = useState<Campus | null>(null);
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [selectedBlockId, setSelectedBlockId] = useState<string>('');
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [allLeases, setAllLeases] = useState<any[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [filterFloor, setFilterFloor] = useState<string>('ALL');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [filterMinArea, setFilterMinArea] = useState<string>('');
    const [filterMaxArea, setFilterMaxArea] = useState<string>('');

    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [editBlockName, setEditBlockName] = useState('');
    const [renameConfirm, setRenameConfirm] = useState<{ blockId: string; newName: string } | null>(null);

    const [editBlockModal, setEditBlockModal] = useState<{ blockId: string; name: string; defaultOperatingFee: number; sqMPerEmployee: number; floorCapacities: { floor: string; totalSqM: number }[] } | null>(null);
    const [editBlockError, setEditBlockError] = useState<string | null>(null);
    const editBlockOriginal = useRef<{ name: string; defaultOperatingFee: number; sqMPerEmployee: number; floorCapacities: { floor: string; totalSqM: number }[] } | null>(null);
    const [editBlockConfirmChanges, setEditBlockConfirmChanges] = useState<{ changes: { label: string; type: 'increase' | 'decrease' | 'info' }[] } | null>(null);

    const [isAddCampusModalOpen, setIsAddCampusModalOpen] = useState(false);
    const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [deleteCampusConfirm, setDeleteCampusConfirm] = useState<Campus | null>(null);
    const [campusDeleteInput, setCampusDeleteInput] = useState('');

    const [globalSearch, setGlobalSearch] = useState('');
    const debouncedGlobalSearch = useDebounce(globalSearch, 300);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const highlightedUnitIdRef = useRef<string | null>(null); // Replaced state with ref if needed? No, keep existing state.
    const [highlightedUnitId, setHighlightedUnitId] = useState<string | null>(null);
    const fixedUnitPriceRef = useRef<number>(0);

    const [assignData, setAssignData] = useState({
        companyId: '',
        campusId: '',
        blockId: '',
        floor: '',
        area: 0,
        isReserved: false,
        reservationDuration: '',
        reservationFee: 0
    });
    const [assignSearch, setAssignSearch] = useState('');
    const [assignError, setAssignError] = useState<string | null>(null);
    const [assignModalUnits, setAssignModalUnits] = useState<Unit[]>([]);

    const [newBlockData, setNewBlockData] = useState({
        name: '',
        maxFloors: 0,
        totalArea: 5000,
        floorAreas: [],
        defaultOperatingFee: 400
    });
    const [newCampusData, setNewCampusData] = useState({ name: '' });

    const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
    const [isModalLoading, setIsModalLoading] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; type: 'campus' | 'block' | 'unit'; targetName: string; targetId: string; blockId?: string; campusId?: string }>({ isOpen: false, type: 'campus', targetName: '', targetId: '' });

    // Tutorial states & Refs
    const [showHelp, setShowHelp] = useState(false);
    const [helpSlide, setHelpSlide] = useState(0);

    const campusBtnRef = useRef<HTMLButtonElement>(null);
    const blockBtnRef = useRef<HTMLButtonElement>(null);
    const companyBtnRef = useRef<HTMLButtonElement>(null);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    // Update target rect when slide changes or window resizes
    useEffect(() => {
        const updateRect = () => {
            let targetRef = null;
            if (helpSlide === 0) targetRef = campusBtnRef.current;
            else if (helpSlide === 1) targetRef = blockBtnRef.current;
            else if (helpSlide === 2) targetRef = companyBtnRef.current;

            if (targetRef && showHelp) {
                const rect = targetRef.getBoundingClientRect();
                setTargetRect(rect);
            }
        };

        if (showHelp) {
            updateRect();
            window.addEventListener('resize', updateRect);
            window.addEventListener('scroll', updateRect, true);
        }

        return () => {
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, true);
        };
    }, [helpSlide, showHelp]);

    const [isEditMode, setIsEditMode] = useState(false);
    const [editFormData, setEditFormData] = useState({
        areaSqM: 0,
        companyName: '',
        sector: '',
        managerName: '',
        managerPhone: '',
        managerEmail: '',
        employeeCount: 0,
        monthlyRent: 0,
        operatingFee: 0,
        startDate: '',
        endDate: ''
    });
    const [editError, setEditError] = useState<string | null>(null);

    useEffect(() => {
        if (blocks.length > 0 && (!selectedBlockId || !blocks.find(b => b.id === selectedBlockId))) {
            setSelectedBlockId(blocks[0].id);
        }
    }, [blocks, selectedBlockId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setIsSearchFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch all data
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [campusesData, companiesData, leasesData] = await Promise.all([
                api.getCampuses(),
                api.getCompanies(5000),
                api.getAllLeaseDetails()
            ]);
            setCampuses(campusesData || []);
            setAllCompanies(companiesData.data || []);
            setAllLeases(leasesData || []);

            // Set initial selected campus
            if (campusesData && campusesData.length > 0 && !selectedCampus) {
                setSelectedCampus(campusesData[0]);
            }
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch blocks when campus changes
    const fetchBlocks = async (campusId: string) => {
        try {
            const blocksData = await api.getBlocks(campusId);
            setBlocks(blocksData || []);
            if (blocksData && blocksData.length > 0) {
                setSelectedBlockId(blocksData[0].id);
            }
        } catch (err) {
            console.error('Failed to fetch blocks:', err);
        }
    };

    // Fetch units for a block
    const fetchUnits = async (blockId: string) => {
        try {
            const unitsData = await api.getUnits(blockId);
            setUnits(unitsData || []);
            return unitsData || [];
        } catch (err) {
            console.error('Failed to fetch units:', err);
            return [];
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (selectedCampus) {
            fetchBlocks(selectedCampus.id);
        }
    }, [selectedCampus]);

    // Fetch units when block changes
    useEffect(() => {
        if (selectedBlockId) {
            fetchUnits(selectedBlockId);
        }
    }, [selectedBlockId]);

    // Fetch units for the assign modal when selected block changes
    useEffect(() => {
        if (assignData.blockId) {
            api.getUnits(assignData.blockId)
                .then(data => setAssignModalUnits(data || []))
                .catch(() => setAssignModalUnits([]));
        } else {
            setAssignModalUnits([]);
        }
    }, [assignData.blockId]);

    // Filter Options
    const campusOptions = useMemo(() => [
        ...campuses.map(c => ({ value: c.id, label: c.name }))
    ], [campuses]);

    const blockOptions = useMemo(() => [
        ...blocks.map(b => ({ value: b.id, label: b.name }))
    ], [blocks]);

    const currentBlock = useMemo(() => blocks.find(b => b.id === selectedBlockId), [blocks, selectedBlockId]);

    const floorOptions = useMemo(() => {
        if (!currentBlock?.floorCapacities) return [{ value: 'ALL', label: 'Tüm Katlar' }];
        const floors = currentBlock.floorCapacities.map(f => f.floor).sort(sortFloors);
        return [{ value: 'ALL', label: 'Tüm Katlar' }, ...floors.map(f => ({ value: f, label: `${f}. Kat` }))];
    }, [currentBlock]);



    const statusOptions = [
        { value: 'ALL', label: 'Tüm Durumlar' },
        { value: 'HAS_VACANCY', label: 'Boşluk Var' },
        { value: 'FULL', label: 'Tam Dolu' },
        { value: 'HAS_RESERVED', label: 'Rezerve Alan Var' },
        { value: 'OVER_CAPACITY', label: 'Kapasite Aşımı' }
    ];

    const globalSearchResults = useMemo(() => {
        if (!debouncedGlobalSearch || debouncedGlobalSearch.length < 2) return [];

        // Search across ALL campuses
        const results: { company: Company, block: Block, unit: Unit, campus: Campus }[] = [];

        campuses.forEach(campus => {
            const campusBlocks = blocks.filter(b => b.campusId === campus.id);
            campusBlocks.forEach(block => {
                const blockUnits = units.filter(u => u.blockId === block.id);
                blockUnits.forEach(unit => {
                    if (unit.companyId) {
                        const company = allCompanies.find(c => c.id === unit.companyId);
                        if (company) {
                            const searchLower = debouncedGlobalSearch.toLowerCase();
                            if (
                                (company.name && company.name.toLowerCase().includes(searchLower)) ||
                                (company.sector && company.sector.toLowerCase().includes(searchLower)) ||
                                (company.managerName && company.managerName.toLowerCase().includes(searchLower))
                            ) {
                                results.push({ company, block, unit, campus });
                            }
                        }
                    }
                });
            });
        });

        return results.slice(0, 8);
    }, [debouncedGlobalSearch, campuses, allCompanies]);

    const filteredBlocks = useMemo(() => {
        if (selectedBlockId === 'ALL') return blocks;
        return blocks.filter(b => b.id === selectedBlockId);
    }, [blocks, selectedBlockId]);

    const searchableCompanies = useMemo(() => {
        // Get fresh list of active allocations to filter out
        // We only want companies that have an active lease OR pending contract BUT NO physical unit
        const activeLeases = allLeases;

        console.log("allLeases type:", typeof activeLeases, "isArray:", Array.isArray(activeLeases));
        if (!Array.isArray(activeLeases)) {
            console.error("activeLeases is NOT an array!", activeLeases);
            return []; // Prevent crash
        }

        // Find companies with "Tahsis Edilmedi" status (Lease exists, but no unit assigned)
        const unallocatedCompanyIds = new Set(
            activeLeases
                // If unit.id is missing or '-', they are considered Detached/Unallocated
                .filter(l => !l.unit?.id || l.unit.id === '-' || l.unit.id === '')
                .map(l => l.company.id)
        );

        const available = allCompanies.filter(c => unallocatedCompanyIds.has(c.id));
        console.log("available count:", available.length, "allCompanies count:", allCompanies.length);
        const ttech = allCompanies.find(c => c.name.includes("T-Tech"));
        console.log("T-Tech in allCompanies?", !!ttech, "is in unallocatedCompanyIds?", ttech ? unallocatedCompanyIds.has(ttech.id) : "N/A");

        if (!assignSearch) return available.slice(0, 50);
        return available.filter(c =>
            c.name.toLowerCase().includes(assignSearch.toLowerCase()) ||
            c.sector.toLowerCase().includes(assignSearch.toLowerCase())
        ).slice(0, 50);
    }, [allCompanies, assignSearch, isAssignModalOpen, allLeases]);

    const assignModalBlocks = useMemo(() => {
        return assignData.campusId ? blocks.filter(b => b.campusId === assignData.campusId) : [];
    }, [assignData.campusId, blocks]);

    const assignModalFloors = useMemo(() => {
        const b = assignModalBlocks.find(x => x.id === assignData.blockId);
        return b ? (b.floorCapacities || []).map(f => f.floor) : [];
    }, [assignModalBlocks, assignData.blockId]);

    const selectedFloorStats = useMemo(() => {
        if (!assignData.blockId || !assignData.floor) return null;
        const block = assignModalBlocks.find(b => b.id === assignData.blockId);
        if (!block || !block.floorCapacities) return null;

        const floorCap = block.floorCapacities.find(f => f.floor === assignData.floor);
        if (!floorCap) return null;

        const blockUnits = assignModalUnits.filter(u => u.blockId === assignData.blockId && u.floor === assignData.floor);
        const rawUsed = blockUnits.reduce((sum, u) => (u.status === 'OCCUPIED' || u.status === 'RESERVED' ? sum + parseFloat(u.areaSqM.toString()) : sum), 0);

        const used = Math.round(rawUsed * 100) / 100;
        const total = Math.round(parseFloat(floorCap.totalSqM.toString()) * 100) / 100;
        const remaining = Math.max(0, Math.round((total - used) * 100) / 100);

        return { total, used, remaining };
    }, [assignData.blockId, assignData.floor, assignModalBlocks, assignModalUnits]);

    const estimatedRent = useMemo(() => {
        if (!assignData.companyId || !assignData.area) return 0;
        const company = allCompanies.find(c => c.id === assignData.companyId);
        if (company && company.contractTemplate) {
            return company.contractTemplate.rentPerSqM * assignData.area;
        }
        return 0;
    }, [assignData.companyId, assignData.area, allCompanies]);

    const selectedCompany = useMemo(() => {
        return allCompanies.find(c => c.id === assignData.companyId);
    }, [assignData.companyId, allCompanies]);

    const handleSelectCampus = async (campus: Campus) => {
        setSelectedCampus(campus);
        await fetchBlocks(campus.id);
        setGlobalSearch('');
        setFilterFloor('ALL');
        setFilterStatus('ALL');
    };

    const handleSearchResultClick = (campus: Campus, blockId: string, unitId: string) => {
        // 1. Switch Campus if needed
        if (selectedCampus?.id !== campus.id) {
            handleSelectCampus(campus);
        }

        // 2. Select Block
        setSelectedBlockId(blockId);

        // 3. Clear Search
        setGlobalSearch('');
        setIsSearchFocused(false);

        // 4. Highlight & Scroll
        setHighlightedUnitId(unitId);

        // Wait for render/expansion
        setTimeout(() => {
            const element = document.getElementById(`unit-alloc-${unitId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // Retry once for good measure if React is slow
                setTimeout(() => {
                    const retryEl = document.getElementById(`unit-alloc-${unitId}`);
                    if (retryEl) retryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
        }, 150);

        // 5. Blink for 3 seconds (was 2s)
        setTimeout(() => setHighlightedUnitId(null), 3000);
    };

    const handleCreateCampus = async () => {
        if (!newCampusData.name) return;
        try {
            const newCampus = await api.addCampus({ name: sanitizeInput(newCampusData.name), address: 'Belirtilmedi', maxOfficeCap: 100, maxAreaCap: 10000, maxFloorsCap: 10 });
            // Trigger event for Dashboard to refresh
            triggerDataChange('campus', 'create');

            // Refetch to sync global state 
            await fetchData();

            setIsAddCampusModalOpen(false);
            setNewCampusData({ name: '' });

            if (newCampus && newCampus.id) {
                // Ensure the exact new campus is selected instead of relying on a potentially stale array
                await handleSelectCampus(newCampus);
            }
        } catch (err: any) {
            alert('Kampüs oluşturulurken hata: ' + (err.message || ''));
        }
    };

    const handleDeleteCampus = async () => {
        if (deleteCampusConfirm && campusDeleteInput === 'ONAYLIYORUM') {
            try {
                await api.deleteCampus(deleteCampusConfirm.id);
                // Trigger event for Dashboard to refresh
                triggerDataChange('campus', 'delete');
                await fetchData();
                const updated = campuses.filter(c => c.id !== deleteCampusConfirm.id);
                setCampuses(updated);
                if (selectedCampus?.id === deleteCampusConfirm.id) {
                    const next = updated[0] || null;
                    if (next) handleSelectCampus(next);
                    else {
                        setSelectedCampus(null);
                        setBlocks([]);
                        setSelectedBlockId('');
                    }
                }
                setDeleteCampusConfirm(null);
                setCampusDeleteInput('');
            } catch (err: any) {
                alert('Kampüs silinirken hata: ' + (err.message || ''));
            }
        }
    };

    const handleCreateBlock = async () => {
        if (!selectedCampus || !newBlockData.name) return;
        const floorCaps: FloorCapacity[] = newBlockData.floorAreas.map((area, idx) => ({
            floor: (idx + 1).toString(),
            totalSqM: area
        }));
        try {
            const newBlock = await api.addBlock({
                campusId: selectedCampus.id,
                name: sanitizeInput(newBlockData.name),
                maxFloors: newBlockData.maxFloors,
                maxOffices: 0,
                maxAreaSqM: newBlockData.totalArea,
                defaultOperatingFee: newBlockData.defaultOperatingFee
            }, floorCaps);

            // Trigger event for Dashboard to refresh
            triggerDataChange('block', 'create');

            // Sync blocks array with backend
            await fetchBlocks(selectedCampus.id);

            setIsAddBlockModalOpen(false);
            setNewBlockData({ name: '', maxFloors: 5, totalArea: 5000, floorAreas: [1000, 1000, 1000, 1000, 1000], defaultOperatingFee: 400 });

            if (newBlock && newBlock.id) {
                // Explicitly select the new block, eliminating reliance on stale closures
                setSelectedBlockId(newBlock.id);
            }
        } catch (err: any) {
            alert('Blok oluşturulurken hata: ' + (err.message || ''));
        }
    };

    const handleAssignSubmit = async () => {
        setAssignError(null);
        try {
            await api.assignCompanyToFloor({
                blockId: assignData.blockId,
                companyId: assignData.companyId,
                floor: assignData.floor,
                areaSqM: assignData.area,
                isReserved: assignData.isReserved,
                reservationFee: assignData.reservationFee,
                reservationDuration: sanitizeInput(assignData.reservationDuration)
            });
            // Trigger event for Dashboard to refresh
            triggerDataChange('unit', 'update');
            setIsAssignModalOpen(false);
            setAssignData({
                companyId: '',
                campusId: '',
                blockId: '',
                floor: '',
                area: 0,
                isReserved: false,
                reservationDuration: '',
                reservationFee: 0
            });
            setAssignSearch('');

            // Refresh leases to update availability list
            const leasesData = await api.getAllLeaseDetails();
            setAllLeases(leasesData || []);

            if (selectedCampus) {
                await fetchBlocks(selectedCampus.id);
                if (selectedBlockId) await fetchUnits(selectedBlockId);
            }
        } catch (err: any) { setAssignError(err.message); }
    };

    const handleUnitClick = async (unitId: string) => {
        // Open modal IMMEDIATELY with loading state
        setEditingUnitId(unitId);
        setIsModalLoading(true);
        setEditError(null);
        setIsEditMode(false);

        try {
            // Parallel API calls for better performance
            const [blockUnits, allLeases, campusBlocks] = await Promise.all([
                api.getUnits(selectedBlockId),
                api.getAllLeaseDetails(),
                api.getBlocks(selectedCampus?.id)
            ]);

            const unit = blockUnits.find(u => u.id === unitId);
            if (!unit) {
                setEditingUnitId(null);
                return;
            }

            // Use company data from unit response (already includes manager info via LEFT JOIN)
            const company = unit.company;
            const lease = allLeases.find(l => l.unit.id === unitId)?.lease;
            const monthlyRent = lease?.monthlyRent || 0;

            // Use block default if lease fee is undefined, but allow 0
            const block = campusBlocks.find(b => b.id === selectedBlockId);
            const defaultFee = block?.defaultOperatingFee ?? 400;
            const operatingFee = lease?.operatingFee ?? defaultFee;

            // Store fixed unit price for calculations
            fixedUnitPriceRef.current = unit.areaSqM > 0 ? monthlyRent / unit.areaSqM : 0;

            // Update form data with fetched values
            setEditFormData({
                areaSqM: unit.areaSqM,
                companyName: company?.name || unit.number,
                sector: company?.sector || 'Belirtilmedi',
                managerName: company?.managerName || '',
                managerPhone: company?.managerPhone || '',
                managerEmail: company?.managerEmail || '',
                employeeCount: company?.employeeCount || 0,
                monthlyRent: monthlyRent,
                operatingFee: operatingFee,
                startDate: isoToDisplay(lease?.startDate || ''),
                endDate: isoToDisplay(lease?.endDate || '')
            });
        } catch (error) {
            console.error('Error loading unit details:', error);
            setEditError('Birim detayları yüklenirken hata oluştu.');
            setEditingUnitId(null);
        } finally {
            setIsModalLoading(false);
        }
    };

    const handleUpdateUnit = async () => {
        if (!editingUnitId) return;

        // Validate Area
        if (!editFormData.areaSqM || editFormData.areaSqM <= 0) {
            setEditError("Hata: Alan (m²) 0'dan büyük olmalıdır.");
            return;
        }

        try {
            await api.updateUnitAndCompany(editingUnitId, {
                areaSqM: editFormData.areaSqM,
                companyName: sanitizeInput(editFormData.companyName),
                sector: sanitizeInput(editFormData.sector),
                managerName: sanitizeInput(editFormData.managerName),
                managerPhone: sanitizeInput(editFormData.managerPhone),
                managerEmail: sanitizeInput(editFormData.managerEmail),
                employeeCount: editFormData.employeeCount
            });

            // Also update lease rent if possible
            const allLeases = await api.getAllLeaseDetails();
            const activeLease = allLeases.find(l => l.unit.id === editingUnitId);
            if (activeLease && activeLease.lease && activeLease.lease.id !== 'PENDING') {
                await api.updateLease(activeLease.company.id, {
                    monthlyRent: editFormData.monthlyRent,
                    operatingFee: editFormData.operatingFee
                });

                if (editFormData.startDate.length === 10 && editFormData.endDate.length === 10) {
                    await api.updateLeaseDates(activeLease.company.id, convertToISO(editFormData.startDate), convertToISO(editFormData.endDate));
                }
            }

            setIsEditMode(false);
            if (selectedCampus) await fetchBlocks(selectedCampus.id);
        } catch (err: any) {
            setEditError(err.message);
        }
    };

    // ... (rest of rendering code, mostly same)
    const allocatedArea = useMemo(() => newBlockData.floorAreas.reduce((a, b) => a + b, 0), [newBlockData.floorAreas]);
    const isAllocationValid = allocatedArea <= newBlockData.totalArea;

    const editingUnitObj = editingUnitId ? allLeases.length > 0 ? allLeases.map(l => ({ unitId: l.unit.id, blockId: l.unit.blockId })).find(u => u.unitId === editingUnitId) : null : null;
    const editBlock = editingUnitObj ? blocks.find(b => b.id === editingUnitObj.blockId) : null;
    const sqMPerEmpEdit = editBlock?.sqMPerEmployee ?? 5;
    const minRequiredArea = editFormData.employeeCount * sqMPerEmpEdit;
    const isCapacityIssue = minRequiredArea > editFormData.areaSqM;

    return (
        <div className="space-y-6 pb-20 px-1 sm:px-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className={`text-lg sm:text-2xl font-bold drop-shadow-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>Bina Yönetimi</h1>
                    <p className={`text-[11px] sm:text-sm ${isLight ? 'text-slate-500' : 'text-slate-200'}`}>Kat kapasiteleri ve firma eşleştirmeleri.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <Button
                        ref={campusBtnRef}
                        variant="secondary"
                        className="flex-1 sm:flex-none text-[10px] sm:text-xs font-bold"
                        onClick={() => setIsAddCampusModalOpen(true)}
                    >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Kampüs Ekle
                    </Button>
                    <Button
                        ref={blockBtnRef}
                        variant="secondary"
                        className="flex-1 sm:flex-none text-[10px] sm:text-xs font-bold"
                        onClick={() => setIsAddBlockModalOpen(true)}
                        disabled={!selectedCampus}
                    >
                        <Building className="w-3.5 h-3.5 mr-1" /> Blok Ekle
                    </Button>
                    <Button
                        ref={companyBtnRef}
                        className="flex-1 sm:flex-none text-[10px] sm:text-xs font-bold"
                        onClick={() => { setAssignData({ companyId: '', campusId: selectedCampus?.id || campuses[0]?.id || '', blockId: selectedBlockId || blocks[0]?.id || '', floor: '', area: 0, isReserved: false, reservationDuration: '', reservationFee: 0 }); setIsAssignModalOpen(true); }}
                        disabled={campuses.length === 0}
                    >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Firma Ekle
                    </Button>
                </div>
            </div>

            {/* Campus Switcher UI (Simplified as requested previously but with width fix) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 pb-4">
                {campuses.map(campus => (
                    <div key={campus.id} className="relative group">
                        <button
                            onClick={() => handleSelectCampus(campus)}
                            className={`w-full flex flex-col gap-2 px-4 sm:px-6 py-3 sm:py-4 rounded-xl border transition-all text-left relative overflow-hidden ${selectedCampus?.id === campus.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-500' : isLight ? 'bg-white border-gray-200 text-slate-700 hover:border-indigo-300' : 'border-white/20 bg-white/10 backdrop-blur-md text-slate-100 hover:bg-white/20 hover:border-white/30'
                                }`}
                        >
                            <div className="flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <div className={`p-1.5 sm:p-2 rounded-lg ${selectedCampus?.id === campus.id ? 'bg-indigo-200 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}><MapPin className="w-4 h-4 sm:w-5 h-5" /></div>
                                    <p className="font-semibold text-sm sm:text-base truncate pr-6">{campus.name}</p>
                                </div>
                                {selectedCampus?.id === campus.id && <Check className="w-4 h-4 text-indigo-500" />}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteCampusConfirm(campus); }} className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 hover:bg-rose-500 hover:text-white z-20 ${selectedCampus?.id === campus.id ? 'text-indigo-300' : 'text-slate-400'}`}><Trash2 className="w-4 h-4" /></button>
                        </button>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-3 w-full z-40 relative">
                <div ref={searchContainerRef} className="relative w-full">
                    <div className={`flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border-2 transition-all shadow-lg ${isSearchFocused ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-gray-200'}`}>
                        <Search className={`w-5 h-5 ${isSearchFocused ? 'text-indigo-600' : 'text-gray-400'}`} />
                        <input type="text" className="w-full bg-transparent border-none outline-none text-sm font-bold text-gray-900 placeholder:text-gray-400" placeholder="Firma, yönetici veya sektör ara..." value={globalSearch} onChange={e => { setGlobalSearch(e.target.value); setIsSearchFocused(true); }} onFocus={() => setIsSearchFocused(true)} />
                        {globalSearch && <button onClick={() => setGlobalSearch('')} className="p-1 hover:bg-gray-100 rounded-full"><X className="w-4 h-4 text-gray-400" /></button>}
                    </div>
                    <AnimatePresence>
                        {isSearchFocused && globalSearch.length >= 2 && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden z-[50]">
                                <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                                    {globalSearchResults.length > 0 ? (
                                        globalSearchResults.map(({ company, block, unit, campus }) => (
                                            <button key={unit.id} onClick={() => handleSearchResultClick(campus, block.id, unit.id)} className="w-full flex items-center justify-between p-4 hover:bg-indigo-50 border-b border-gray-50 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-white rounded-lg border border-gray-100 shadow-sm text-indigo-600 group-hover:scale-110 transition-transform"><Building2 className="w-4 h-4" /></div>
                                                    <div className="text-left">
                                                        <div className="text-sm font-bold text-gray-900">{company.name}</div>
                                                        <div className="text-[10px] font-bold text-gray-500 uppercase">{company.sector}</div>
                                                        <div className="text-[9px] font-bold text-gray-400 mt-0.5">{campus.name}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 text-right">
                                                    <div><div className="text-xs font-bold text-indigo-600 flex items-center justify-end gap-1"><Building className="w-3 h-3" /> {block.name}</div><div className="text-[10px] font-bold text-gray-400 uppercase">{unit.floor}. KAT</div></div>
                                                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                                                </div>
                                            </button>
                                        ))
                                    ) : <div className="p-8 text-center text-gray-400">Bulunamadı.</div>}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 6-Column Filter Bar */}
                <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-gray-200 p-4 shadow-sm grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Kampüs Seçimi</label>
                        <Dropdown
                            options={campusOptions}
                            value={selectedCampus?.id || ''}
                            onChange={(val) => {
                                const c = campuses.find(x => x.id === val);
                                if (c) handleSelectCampus(c);
                            }}
                            icon={<MapPin size={14} />}
                            className="text-xs"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Blok Seçimi</label>
                        <Dropdown
                            options={blockOptions}
                            value={selectedBlockId}
                            onChange={setSelectedBlockId}
                            icon={<Building size={14} />}
                            className="text-xs"
                            disabled={!selectedCampus}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Kat Filtresi</label>
                        <Dropdown
                            options={floorOptions}
                            value={filterFloor}
                            onChange={setFilterFloor}
                            icon={<Layers size={14} />}
                            className="text-xs"
                            placeholder="Tüm Katlar"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Durum Filtresi</label>
                        <Dropdown
                            options={statusOptions}
                            value={filterStatus}
                            onChange={setFilterStatus}
                            icon={<Filter size={14} />}
                            className="text-xs"
                            placeholder="Tüm Durumlar"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5 md:col-span-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Boş Alan Aralığı (m²)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                placeholder="Min"
                                className="w-full bg-white border border-gray-200 rounded-lg py-2 px-3 text-xs font-bold outline-none focus:border-indigo-500 transition-all placeholder:font-normal text-gray-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={filterMinArea}
                                onChange={(e) => setFilterMinArea(e.target.value)}
                            />
                            <input
                                type="number"
                                placeholder="Max"
                                className="w-full bg-white border border-gray-200 rounded-lg py-2 px-3 text-xs font-bold outline-none focus:border-indigo-500 transition-all placeholder:font-normal text-gray-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={filterMaxArea}
                                onChange={(e) => setFilterMaxArea(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {selectedCampus && (
                    <motion.div key={selectedCampus.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-6 shadow-inner">
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4 max-w-full">
                            <div className="w-full">
                                <div className="flex items-center gap-3 mb-1"><h3 className="text-base sm:text-xl font-black text-gray-900">Blok ve Kat Yapısı</h3></div>
                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    {blocks.map(b => (
                                        <button key={b.id} onClick={() => setSelectedBlockId(b.id)} className={`px-4 py-2.5 rounded-xl text-[10px] sm:text-xs font-black transition-all border ${selectedBlockId === b.id ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'}`}>{b.name}</button>
                                    ))}
                                    {blocks.length === 0 && (
                                        <button onClick={() => setIsAddBlockModalOpen(true)} className="px-4 py-2.5 rounded-xl text-[10px] sm:text-xs font-black transition-all border bg-white text-indigo-600 border-dashed border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50 flex items-center gap-1">
                                            <Plus className="w-4 h-4" /> Blok Ekle
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-8">
                            {filteredBlocks.map(block => (
                                <div key={block.id} className="space-y-8">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-200 pb-4 gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-xl"><Building className="w-6 h-6" /></div>
                                            <div>
                                                <div className="flex items-center gap-2 group/edit">
                                                    <h3 className="font-black text-xl text-gray-900 leading-none">{block.name}</h3>
                                                    <button
                                                        onClick={() => {
                                                            const origFloors = (block.floorCapacities || []).map(fc => ({ floor: fc.floor, totalSqM: fc.totalSqM }));
                                                            editBlockOriginal.current = {
                                                                name: block.name,
                                                                defaultOperatingFee: block.defaultOperatingFee ?? 400,
                                                                sqMPerEmployee: block.sqMPerEmployee ?? 5,
                                                                floorCapacities: origFloors
                                                            };
                                                            setEditBlockModal({
                                                                blockId: block.id,
                                                                name: block.name,
                                                                defaultOperatingFee: block.defaultOperatingFee ?? 400,
                                                                sqMPerEmployee: block.sqMPerEmployee ?? 5,
                                                                floorCapacities: origFloors.map(f => ({ ...f }))
                                                            });
                                                            setEditBlockError(null);
                                                            setEditBlockConfirmChanges(null);
                                                        }}
                                                        className="text-gray-400 hover:text-indigo-500 transition-colors"
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1 tracking-widest">Mimari Kat Yerleşimi</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                                            <div className="text-right"><div className="text-[10px] font-black text-gray-400 uppercase">Toplam Alan</div><div className="text-sm font-black text-gray-900">{block.maxAreaSqM.toLocaleString()} m²</div></div>
                                            <span className="h-10 w-px bg-gray-200" />
                                            <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full uppercase shadow-sm">{block.maxFloors} KATLI</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-6">
                                        {(block.floorCapacities || [])
                                            .filter(fc => {
                                                if (filterFloor !== 'ALL' && fc.floor !== filterFloor) return false;
                                                const floorUnits = units.filter(u => u.blockId === block.id && u.floor === fc.floor);
                                                const used = floorUnits.reduce((sum, u) => (u.status === 'OCCUPIED' || u.status === 'RESERVED' ? sum + u.areaSqM : sum), 0);
                                                const total = fc.totalSqM;
                                                const occupancy = total > 0 ? (used / total) * 100 : 0;
                                                const availableSqM = total - used;

                                                if (filterMinArea && !isNaN(parseFloat(filterMinArea)) && availableSqM < parseFloat(filterMinArea)) return false;
                                                if (filterMaxArea && !isNaN(parseFloat(filterMaxArea)) && availableSqM > parseFloat(filterMaxArea)) return false;

                                                if (filterStatus === 'HAS_VACANCY' && occupancy >= 99.9) return false;
                                                if (filterStatus === 'FULL' && occupancy < 99.9) return false;
                                                if (filterStatus === 'HAS_RESERVED' && !floorUnits.some(u => u.status === 'RESERVED')) return false;
                                                if (filterStatus === 'OVER_CAPACITY') {
                                                    const hasWarning = floorUnits.some(u => {
                                                        const comp = allCompanies.find(c => c.id === u.companyId);
                                                        if (!comp) return false;
                                                        const blk = blocks.find(b => b.id === u.blockId);
                                                        const sqMRatio = blk?.sqMPerEmployee ?? 5;
                                                        return (comp.employeeCount * sqMRatio) > u.areaSqM;
                                                    });
                                                    if (!hasWarning) return false;
                                                }
                                                return true;
                                            })
                                            .sort((a, b) => sortFloors(a.floor, b.floor))
                                            .map(fc => (
                                                <FloorRow
                                                    key={`${block.id}-${fc.floor}`}
                                                    block={block}
                                                    floorCap={fc}
                                                    currentUnits={units.filter(u => u.blockId === block.id)}
                                                    allCompanies={allCompanies}
                                                    highlightedUnitId={highlightedUnitId}
                                                    onUnitClick={handleUnitClick}
                                                    onRefresh={async () => {
                                                        // Refresh leases to update availability list
                                                        const leasesData = await api.getAllLeaseDetails();
                                                        setAllLeases(leasesData || []);

                                                        await fetchBlocks(selectedCampus!.id);
                                                        // Also refresh units for all blocks in the campus
                                                        const refreshedUnits = await Promise.all(
                                                            blocks.map(b => api.getUnits(b.id))
                                                        );
                                                        setUnits(refreshedUnits.flat());
                                                    }}
                                                    onEmptyClick={(bId, fl) => {
                                                        setAssignData({
                                                            companyId: '',
                                                            campusId: selectedCampus!.id,
                                                            blockId: bId,
                                                            floor: fl,
                                                            area: 0,
                                                            isReserved: false,
                                                            reservationDuration: '',
                                                            reservationFee: 0
                                                        });
                                                        setIsAssignModalOpen(true);
                                                    }}
                                                />
                                            ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit/Detail Modal */}
            {editingUnitId && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-5 py-4 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                    <Building2 className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">{isEditMode ? 'Tahsisatı Düzenle' : 'Tahsisat Detayları'}</h3>
                            </div>
                            <button onClick={() => setEditingUnitId(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
                        </div>

                        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
                            {isModalLoading ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                                    <p className="text-sm text-gray-500 mt-3 font-medium">Birim detayları yükleniyor...</p>
                                </div>
                            ) : (
                                <>
                                    {isCapacityIssue && (
                                        <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3 animate-pulse">
                                            <div className="p-1.5 bg-rose-100 rounded-lg text-rose-600 shrink-0">
                                                <AlertTriangle className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="text-rose-700 font-bold text-xs">Kapasite Aşımı</h4>
                                                <p className="text-rose-600 text-[10px] font-medium mt-0.5">
                                                    Min. alan: {minRequiredArea} m² (Kişi başı {sqMPerEmpEdit} m²). Mevcut: {editFormData.areaSqM} m².
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {editError && (
                                        <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" /> {editError}
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-4">
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Firma Adı</label>
                                            {isEditMode ? (
                                                <input
                                                    type="text"
                                                    className="w-full bg-transparent border-b border-indigo-200 outline-none text-base font-black text-gray-900 placeholder-gray-300 focus:border-indigo-500 transition-all"
                                                    value={editFormData.companyName}
                                                    onChange={e => setEditFormData({ ...editFormData, companyName: e.target.value })}
                                                />
                                            ) : (
                                                <div className="text-base font-black text-gray-900 truncate">
                                                    {editFormData.companyName}
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-4">
                                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-full">
                                                    <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 mb-3">
                                                        <LayoutGrid className="w-3 h-3" /> Ofis & Konum
                                                    </h4>
                                                    {(() => {
                                                        const activeLease = allLeases.find(l => l.unit.id === editingUnitId);
                                                        // Handle Rent Logic
                                                        // Get current monthly rent
                                                        const currentMonthlyRent = isEditMode ? (editFormData.monthlyRent || 0) : (activeLease?.lease.monthlyRent || 0);

                                                        // 2. Calculate Rent Per SqM (dynamic based on current area)
                                                        // If in edit mode, use the form data area. If not, use static.
                                                        const currentArea = editFormData.areaSqM || 1;
                                                        const currentRentPerSqM = (currentMonthlyRent / currentArea) || 0;

                                                        const block = blocks.find(b => b.id === selectedBlockId);
                                                        const defaultFee = block?.defaultOperatingFee ?? 400;
                                                        // Allow 0 as valid value using nullish coalescing
                                                        const operatingFee = activeLease?.lease.operatingFee ?? defaultFee;

                                                        return (
                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                                <div>
                                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Kampüs</label>
                                                                    <div className="font-bold text-gray-900 text-xs truncate">{selectedCampus?.name}</div>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Blok</label>
                                                                    <div className="font-bold text-gray-900 text-xs truncate">{blocks.find(b => b.id === selectedBlockId)?.name}</div>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Kat</label>
                                                                    <div className="font-bold text-gray-900 text-xs">{units.find(u => u.id === editingUnitId)?.floor}. Kat</div>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Sektör</label>
                                                                    {isEditMode ? (
                                                                        <input
                                                                            type="text"
                                                                            className="w-full bg-transparent border-b border-gray-200 outline-none text-xs font-bold text-gray-500 placeholder-gray-300 cursor-not-allowed"
                                                                            value={editFormData.sector}
                                                                            disabled
                                                                            readOnly
                                                                        />
                                                                    ) : (
                                                                        <div className="font-bold text-gray-900 text-xs truncate">{editFormData.sector}</div>
                                                                    )}
                                                                </div>

                                                                <div className="col-span-2 grid grid-cols-2 gap-4 pt-2 border-t border-gray-100 mt-1">
                                                                    <div>
                                                                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Sözleşme Başlangıç</label>
                                                                        {isEditMode ? (
                                                                            <div className="relative">
                                                                                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 pointer-events-none" />
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="GG.AA.YYYY"
                                                                                    maxLength={10}
                                                                                    className="w-full pl-6 p-1 bg-gray-100 border border-gray-200 rounded text-xs font-bold outline-none text-gray-500 cursor-not-allowed"
                                                                                    value={editFormData.startDate}
                                                                                    disabled
                                                                                    readOnly
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="font-bold text-gray-900 text-xs truncate">
                                                                                {editFormData.startDate || '-'}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Sözleşme Bitiş</label>
                                                                        {isEditMode ? (
                                                                            <div className="relative">
                                                                                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 pointer-events-none" />
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="GG.AA.YYYY"
                                                                                    maxLength={10}
                                                                                    className="w-full pl-6 p-1 bg-gray-100 border border-gray-200 rounded text-xs font-bold outline-none text-gray-500 cursor-not-allowed"
                                                                                    value={editFormData.endDate}
                                                                                    disabled
                                                                                    readOnly
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="font-bold text-gray-900 text-xs truncate">
                                                                                {editFormData.endDate || '-'}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">m² Birim Kira</label>
                                                                    {isEditMode ? (
                                                                        <div className="relative">
                                                                            <input
                                                                                type="text"
                                                                                className="w-full pl-2 p-1.5 bg-gray-100 border border-gray-200 rounded text-xs font-bold outline-none text-gray-500 cursor-not-allowed"
                                                                                value={isEditMode ? (fixedUnitPriceRef.current < 1.01 ? 'ÜCRETSİZ' : fixedUnitPriceRef.current.toFixed(2)) : (currentRentPerSqM < 1.01 ? 'ÜCRETSİZ' : currentRentPerSqM.toFixed(2))}
                                                                                disabled
                                                                                readOnly
                                                                            />
                                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">TL</span>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="font-bold text-gray-900 text-xs">
                                                                            {currentRentPerSqM < 1.01 ? 'ÜCRETSİZ' : `${formatCurrency(currentRentPerSqM, isPresentationMode)} TL`}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div>
                                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Aylık Kira</label>
                                                                    <div className="font-bold text-gray-900 text-xs">
                                                                        {currentMonthlyRent < 1.01 ? 'ÜCRETSİZ' : `${formatCurrency(currentMonthlyRent, isPresentationMode)} TL`}
                                                                    </div>
                                                                </div>

                                                                <div className="col-span-2">
                                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">İşletme Ücreti</label>
                                                                    {isEditMode ? (
                                                                        <div className="relative">
                                                                            <input
                                                                                type="number"
                                                                                className="w-full pl-2 p-1.5 bg-indigo-50 border border-indigo-200 rounded text-xs font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                                value={editFormData.operatingFee === 0 ? '' : (editFormData.operatingFee ?? operatingFee)}
                                                                                placeholder="ÜCRETSİZ"
                                                                                onChange={(e) => {
                                                                                    if (e.target.value === '') {
                                                                                        setEditFormData({ ...editFormData, operatingFee: 0 });
                                                                                        return;
                                                                                    }
                                                                                    let val = parseFloat(e.target.value);
                                                                                    if (val < 0) val = 0;
                                                                                    if (isNaN(val)) val = 0;
                                                                                    setEditFormData({ ...editFormData, operatingFee: val });
                                                                                }}
                                                                            />
                                                                            <span className="absolute right-9 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">TL / Ay</span>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="font-bold text-slate-800 text-sm">
                                                                            {(() => {
                                                                                const fee = activeLease?.lease.operatingFee ?? (blocks.find(b => b.id === selectedBlockId)?.defaultOperatingFee ?? 400);
                                                                                return fee < 1.01 ? 'ÜCRETSİZ' : `${formatCurrency(fee, isPresentationMode)} TL / Ay`;
                                                                            })()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-gray-200">
                                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                                                            <label className="block text-[8px] font-bold text-indigo-400 uppercase mb-0.5">Alan (m²)</label>
                                                            {isEditMode ? (
                                                                <input
                                                                    type="number"
                                                                    placeholder="0"
                                                                    className="w-full bg-transparent border-b border-indigo-300 outline-none text-sm font-black text-gray-900 appearance-[textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                    value={editFormData.areaSqM === 0 ? '' : editFormData.areaSqM}
                                                                    min="1"
                                                                    onChange={(e) => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        // Calculate Max Limit
                                                                        const unit = units.find(u => u.id === editingUnitId);
                                                                        if (unit) {
                                                                            const block = blocks.find(b => b.id === unit.blockId);
                                                                            const floorCap = block?.floorCapacities?.find(f => f.floor === unit.floor);
                                                                            if (floorCap) {
                                                                                const otherUnits = units.filter(u => u.blockId === unit.blockId && u.floor === unit.floor && u.id !== editingUnitId);
                                                                                const usedByOthers = otherUnits.reduce((sum, u) => (u.status === 'OCCUPIED' || u.status === 'RESERVED' ? sum + u.areaSqM : sum), 0);
                                                                                const remainingForThis = floorCap.totalSqM - usedByOthers;

                                                                                if (val <= remainingForThis) {
                                                                                    // Auto-calculate new rent based on const unit price from ref
                                                                                    const newRent = val * fixedUnitPriceRef.current;

                                                                                    setEditFormData({
                                                                                        ...editFormData,
                                                                                        areaSqM: val,
                                                                                        monthlyRent: newRent
                                                                                    });
                                                                                    setEditError(null);
                                                                                } else {
                                                                                    // Optional: Show error or clamp
                                                                                    setEditError(`Hata: Bu katta müsait alan sınırı aşıldı! (Maks: ${remainingForThis} m²)`);
                                                                                }
                                                                            }
                                                                        }
                                                                    }}
                                                                />
                                                            ) : (
                                                                <div className="text-sm font-black text-slate-900">{editFormData.areaSqM} m²</div>
                                                            )}
                                                        </div>
                                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                                                            <label className="block text-[8px] font-bold text-indigo-400 uppercase mb-0.5">Çalışan</label>
                                                            {isEditMode ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="number"
                                                                        onWheel={(e) => e.currentTarget.blur()}
                                                                        className="w-full bg-white border border-gray-200 rounded px-2 py-0.5 text-sm font-black text-gray-900 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-gray-400/50"
                                                                        value={editFormData.employeeCount === 0 ? '' : editFormData.employeeCount}
                                                                        placeholder="Belirtilmedi"
                                                                        onChange={e => {
                                                                            if (e.target.value === '') {
                                                                                setEditFormData({ ...editFormData, employeeCount: 0 });
                                                                                return;
                                                                            }
                                                                            const val = parseInt(e.target.value);
                                                                            setEditFormData({ ...editFormData, employeeCount: isNaN(val) ? 0 : Math.max(0, val) });
                                                                        }}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="text-sm font-black text-slate-900">
                                                                    {editFormData.employeeCount > 0 ? `${editFormData.employeeCount} Kişi` : 'Belirtilmedi'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-full">
                                                    <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 mb-3">
                                                        <User className="w-3 h-3" /> İletişim
                                                    </h4>
                                                    <div className="space-y-3">
                                                        <div className="group">
                                                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Yönetici</label>
                                                            {isEditMode ? (
                                                                <div className="flex items-center gap-2 p-2 rounded-lg border transition-all bg-gray-50 border-gray-200 opacity-70">
                                                                    <User className="w-3.5 h-3.5 text-gray-400" />
                                                                    <input
                                                                        type="text"
                                                                        className="w-full bg-transparent outline-none text-xs font-bold text-gray-500 cursor-not-allowed"
                                                                        value={editFormData.managerName}
                                                                        disabled
                                                                        readOnly
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                                                    <span className="font-bold text-gray-900 text-xs truncate">{editFormData.managerName || '-'}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="group">
                                                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Telefon</label>
                                                            {isEditMode ? (
                                                                <div className="flex items-center gap-2 p-2 rounded-lg border transition-all bg-gray-50 border-gray-200 opacity-70">
                                                                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                                                                    <input
                                                                        type="text"
                                                                        className="w-full bg-transparent outline-none text-xs font-bold text-gray-500 cursor-not-allowed"
                                                                        value={editFormData.managerPhone}
                                                                        disabled
                                                                        readOnly
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                                                                    <span className="font-bold text-gray-900 text-xs truncate">{editFormData.managerPhone || '-'}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="group">
                                                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">E-Posta</label>
                                                            {isEditMode ? (
                                                                <div className="flex items-center gap-2 p-2 rounded-lg border transition-all bg-gray-50 border-gray-200 opacity-70">
                                                                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                                                                    <input
                                                                        type="text"
                                                                        className="w-full bg-transparent outline-none text-xs font-bold text-gray-500 cursor-not-allowed"
                                                                        value={editFormData.managerEmail}
                                                                        disabled
                                                                        readOnly
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                                                                    <span className="font-bold text-gray-900 text-xs truncate">{editFormData.managerEmail || '-'}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="p-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-200 shrink-0">
                            {isEditMode ? (
                                <>
                                    <Button variant="ghost" onClick={() => { if (editingUnitId) handleUnitClick(editingUnitId); }} className="h-9 text-xs">İptal</Button>
                                    <Button className="bg-emerald-600 hover:bg-emerald-700 h-9 text-xs" onClick={handleUpdateUnit}><Save className="w-3.5 h-3.5" /> Kaydet</Button>
                                </>
                            ) : (
                                <>
                                    <Button variant="ghost" onClick={() => setEditingUnitId(null)} className="h-9 text-xs">Kapat</Button>
                                    <Button onClick={() => setIsEditMode(true)} className="h-9 text-xs"><Edit3 className="w-3.5 h-3.5" /> Düzenle</Button>
                                </>
                            )}
                        </div>
                    </motion.div >
                </div >,
                document.body
            )}

            {/* Delete Campus Confirm */}
            {
                deleteCampusConfirm && createPortal(
                    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-rose-100">
                            <div className="p-8 text-center"><div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-rose-100 shadow-inner"><ShieldAlert className="w-10 h-10" /></div><h3 className="text-2xl font-black text-gray-900 mb-4">KRİTİK İŞLEM!</h3><p className="text-sm text-gray-600 font-medium leading-relaxed mb-6"><span className="font-black text-rose-600">{deleteCampusConfirm.name}</span> kampüsünü silmek üzeresiniz.</p><div className="space-y-4"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Onaylamak için <span className="text-rose-500">ONAYLIYORUM</span> yazın</p><input type="text" autoFocus placeholder="ONAYLIYORUM" className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-center text-lg font-black text-black focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 outline-none" value={campusDeleteInput} onChange={e => setCampusDeleteInput(e.target.value)} /></div></div>
                            <div className="p-6 bg-slate-50 flex gap-4 border-t border-slate-100"><Button variant="ghost" className="flex-1 font-bold text-slate-500" onClick={() => { setDeleteCampusConfirm(null); setCampusDeleteInput(''); }}>Vazgeç</Button><Button variant="danger" className="flex-1 font-black shadow-xl" disabled={campusDeleteInput !== 'ONAYLIYORUM'} onClick={handleDeleteCampus}>KAMPÜSÜ SİL</Button></div>
                        </motion.div>
                    </div>, document.body
                )
            }

            {/* Add Block Modal */}
            {
                isAddBlockModalOpen && createPortal(
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center shrink-0 shadow-lg z-10">
                                <div>
                                    <h3 className="text-xl font-bold">Yeni Blok Ekle</h3>
                                    <p className="text-indigo-200 text-xs font-bold mt-1">Blok kapasitesini ve kat detaylarını yapılandırın.</p>
                                </div>
                                <button onClick={() => setIsAddBlockModalOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"><X className="w-6 h-6" /></button>
                            </div>

                            <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar bg-slate-50/50">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Blok Adı</label>
                                        <input
                                            type="text"
                                            autoFocus
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-bold outline-none transition-all bg-white shadow-sm text-black"
                                            placeholder="Örn: A Blok"
                                            value={newBlockData.name}
                                            onChange={e => setNewBlockData({ ...newBlockData, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-black uppercase mb-2">Toplam Kapasite (m²)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="100"
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-bold outline-none transition-all bg-white shadow-sm text-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                placeholder="5000"
                                                value={newBlockData.totalArea}
                                                onChange={e => setNewBlockData({ ...newBlockData, totalArea: parseFloat(e.target.value) || 0 })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">m²</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">İşletme Ücreti (TL)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-bold outline-none transition-all bg-white shadow-sm text-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            placeholder="400"
                                            value={newBlockData.defaultOperatingFee}
                                            onChange={e => setNewBlockData({ ...newBlockData, defaultOperatingFee: parseFloat(e.target.value) || 0 })}
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">TL / Ay</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-medium mt-1.5 ml-1">Bu bloktaki tüm firmalara otomatik uygulanır. Firma bazlı değiştirilebilir.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Kat Sayısı</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        onWheel={(e) => e.currentTarget.blur()}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-bold outline-none transition-all bg-white shadow-sm text-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={newBlockData.maxFloors === 0 ? '' : newBlockData.maxFloors}
                                        onChange={e => {
                                            const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                            const oldAreas = [...newBlockData.floorAreas];
                                            const defaultArea = 0;
                                            let newAreas = oldAreas;
                                            if (val > oldAreas.length) {
                                                newAreas = [...oldAreas, ...new Array(val - oldAreas.length).fill(defaultArea)];
                                            } else {
                                                newAreas = oldAreas.slice(0, val);
                                            }
                                            setNewBlockData({
                                                ...newBlockData,
                                                maxFloors: val,
                                                floorAreas: newAreas
                                            });
                                        }}
                                    />
                                </div>

                                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                    <div className="flex justify-between items-end mb-4">
                                        <div>
                                            <h4 className="font-bold text-gray-900 text-sm">Alan Dağılımı</h4>
                                            <p className="text-[10px] text-gray-400 font-bold mt-1">Toplam kapasiteden katlara dağıtılan miktar</p>
                                        </div>
                                        <div className={`text-right ${isAllocationValid ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            <div className="text-xl font-black">{allocatedArea.toLocaleString()} / {newBlockData.totalArea.toLocaleString()} m²</div>
                                            <div className="text-[9px] font-bold uppercase">{isAllocationValid ? 'Kapasite Uygun' : 'Kapasite Aşıldı'}</div>
                                        </div>
                                    </div>
                                    <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex relative">
                                        <div
                                            className={`h-full transition-all duration-500 ${isAllocationValid ? 'bg-indigo-500' : 'bg-rose-500'}`}
                                            style={{ width: `${Math.min(100, (allocatedArea / newBlockData.totalArea) * 100)}%` }}
                                        />
                                        <div className="absolute top-0 bottom-0 right-0 w-0.5 bg-gray-300 z-10" />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="block text-xs font-bold text-gray-500 uppercase">Kat Alanları ({newBlockData.maxFloors})</label>
                                        <button
                                            onClick={() => {
                                                const splitArea = Math.floor(newBlockData.totalArea / newBlockData.maxFloors);
                                                setNewBlockData({
                                                    ...newBlockData,
                                                    floorAreas: new Array(newBlockData.maxFloors).fill(splitArea)
                                                });
                                            }}
                                            className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1"
                                        >
                                            <Divide className="w-3 h-3" /> Eşit Dağıt
                                        </button>
                                    </div>

                                    <div className="space-y-3 max-h-[350px] overflow-y-auto custom-scrollbar p-1">
                                        {newBlockData.floorAreas.map((area, idx) => (
                                            <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded-xl border border-gray-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all shadow-sm">
                                                <span className="text-xs font-bold text-gray-700 whitespace-nowrap min-w-[140px]">
                                                    {idx + 1}. Kat için m² girin:
                                                </span>
                                                <div className="flex-1 relative">
                                                    <input
                                                        type="number"
                                                        className="w-full bg-transparent text-sm font-bold text-black outline-none text-right pr-7 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        value={area === 0 ? '' : area}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            const updated = [...newBlockData.floorAreas];
                                                            updated[idx] = val;
                                                            setNewBlockData({ ...newBlockData, floorAreas: updated });
                                                        }}
                                                    />
                                                    <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">m²</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </div>

                            <div className="p-6 border-t bg-gray-50 flex justify-between items-center shrink-0">
                                <div className="text-xs font-bold text-gray-500">
                                    {newBlockData.maxFloors} Kat, {newBlockData.totalArea} m²
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="ghost" onClick={() => setIsAddBlockModalOpen(false)}>İptal</Button>
                                    <Button
                                        onClick={handleCreateBlock}
                                        disabled={!newBlockData.name || !isAllocationValid}
                                        className={`px-6 ${!isAllocationValid ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isAllocationValid ? 'Kaydet' : 'Kapasite Aşımı'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }

            {/* Add Campus Modal */}
            {
                isAddCampusModalOpen && createPortal(
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"><div className="p-6 bg-indigo-600 text-white flex justify-between items-center"><h3 className="text-lg font-bold">Yeni Kampüs Tanımla</h3><button onClick={() => setIsAddCampusModalOpen(false)}><X className="w-5 h-5" /></button></div><div className="p-6 space-y-4"><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Kampüs Adı</label><input type="text" autoFocus className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-indigo-500 font-bold text-black" value={newCampusData.name} onChange={e => setNewCampusData({ name: e.target.value })} /></div><div className="p-4 border-t bg-gray-50 flex justify-end gap-3"><Button variant="ghost" onClick={() => setIsAddCampusModalOpen(false)}>İptal</Button><Button onClick={handleCreateCampus} disabled={!newCampusData.name}>Kaydet</Button></div></div></div>, document.body
                )
            }

            {/* Assign Company Modal */}
            {
                isAssignModalOpen && createPortal(
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl h-[90vh] sm:h-[650px] flex flex-col md:flex-row overflow-hidden">
                            <div className="w-full md:w-2/5 h-1/3 md:h-auto bg-slate-50 border-r-0 border-b md:border-r md:border-b-0 border-slate-200 p-6 flex flex-col">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Building2 className="w-4 h-4" /> Firma Seçimi</h3>
                                <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Firma ara..." value={assignSearch} onChange={e => setAssignSearch(e.target.value)} /></div>
                                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">{searchableCompanies.map(comp => (<button key={comp.id} onClick={() => { setAssignData({ ...assignData, companyId: comp.id }); setAssignError(null); }} className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${assignData.companyId === comp.id ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-indigo-300'}`}><div className="min-w-0 flex-1"><div className={`text-xs font-bold truncate ${assignData.companyId === comp.id ? 'text-white' : 'text-slate-900'}`}>{comp.name}</div><div className={`text-[10px] font-bold uppercase mt-0.5 ${assignData.companyId === comp.id ? 'text-indigo-100' : 'text-slate-400'}`}>{comp.sector}</div></div><ChevronRight className={`w-4 h-4 transition-transform ${assignData.companyId === comp.id ? 'translate-x-1' : 'opacity-0 group-hover:opacity-100'}`} /></button>))}</div>
                            </div>
                            <div className="flex-1 p-6 md:p-8 flex flex-col relative bg-white overflow-y-auto">
                                <button onClick={() => setIsAssignModalOpen(false)} className="absolute top-4 right-4 md:top-6 md:right-6 p-2 rounded-full hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
                                <div className="mb-6 md:mb-8"><h2 className="text-xl md:text-2xl font-bold text-slate-900">Kat Tahsisi Yap</h2><p className="text-xs md:text-sm text-slate-500 font-medium">Firmayı ilgili bloğa ve kata yerleştirin.</p></div>
                                {assignError && <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center gap-3"><AlertCircle className="w-5 h-5 shrink-0" /><p className="text-xs font-bold leading-tight">{assignError}</p></div>}
                                <div className="flex-1 space-y-4 md:space-y-6">
                                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                                        <div className="col-span-2">
                                            <label className="block text-[10px] font-bold text-black uppercase mb-2">Seçilen Firma</label>
                                            {allCompanies.find(c => c.id === assignData.companyId) ? (
                                                <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl relative overflow-hidden">
                                                    <div className="p-2 bg-white rounded-lg border border-indigo-100 text-indigo-600 relative z-10">
                                                        <Building2 className="w-5 h-5" />
                                                    </div>
                                                    <div className="relative z-10 flex-1">
                                                        <div className="text-sm font-black text-indigo-900">{selectedCompany?.name}</div>
                                                        <div className="text-[10px] font-bold text-indigo-500 uppercase">{selectedCompany?.sector}</div>
                                                        {selectedCompany?.contractTemplate && (
                                                            <div className="mt-1 flex items-center gap-2 text-[10px] font-bold bg-indigo-100 text-indigo-700 w-fit px-2 py-0.5 rounded">
                                                                <Check className="w-3 h-3" />
                                                                Sözleşme Mevcut ({selectedCompany.contractTemplate.rentPerSqM} TL/m²)
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3 p-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
                                                    <div className="p-2 bg-slate-100 rounded-lg text-slate-400">
                                                        <Search className="w-5 h-5" />
                                                    </div>
                                                    <div className="text-xs font-bold text-slate-400">Lütfen soldaki listeden bir firma seçiniz.</div>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-black uppercase mb-2">Hedef Kampüs</label>
                                            <Dropdown
                                                options={campuses.map(c => ({ value: c.id, label: c.name }))}
                                                value={assignData.campusId || (selectedCampus?.id || '')} // Default to selectedCampus if not set
                                                onChange={(val) => {
                                                    setAssignData({
                                                        ...assignData,
                                                        campusId: val,
                                                        blockId: '',
                                                        floor: ''
                                                    });
                                                }}
                                                placeholder="Kampüs Seçin..."
                                                className="text-xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-black uppercase mb-2">Hedef Blok</label>
                                            <Dropdown
                                                options={assignModalBlocks.map(b => ({ value: b.id, label: b.name }))}
                                                value={assignData.blockId}
                                                onChange={(val) => setAssignData({ ...assignData, blockId: val, floor: '' })}
                                                placeholder="Blok Seçin..."
                                                disabled={!assignData.campusId && !selectedCampus} // Should be enabled if campus is selected
                                                className="text-xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-black uppercase mb-2">Kat</label>
                                            <Dropdown
                                                options={(() => {
                                                    const block = assignModalBlocks.find(b => b.id === assignData.blockId);
                                                    if (!block || !block.floorCapacities) return [];
                                                    const blockUnits = assignModalUnits.filter(u => u.blockId === assignData.blockId);

                                                    return (block.floorCapacities || []).map(fc => {
                                                        const floorUnits = blockUnits.filter(u => u.floor === fc.floor);
                                                        const used = floorUnits.reduce((sum, u) => (u.status === 'OCCUPIED' || u.status === 'RESERVED' ? sum + u.areaSqM : sum), 0);
                                                        const isFull = used >= fc.totalSqM; // Start warning at 100% or close to it? User said "100% dolu".

                                                        return {
                                                            value: fc.floor,
                                                            label: isFull ? (
                                                                <div className="flex items-center gap-2 text-rose-600">
                                                                    <AlertCircle className="w-3.5 h-3.5 fill-rose-100" />
                                                                    <span>{fc.floor}. Kat (DOLU)</span>
                                                                </div>
                                                            ) : (
                                                                <span>{fc.floor}. Kat</span>
                                                            )
                                                        };
                                                    });
                                                })()}
                                                value={assignData.floor}
                                                onChange={(val) => setAssignData({ ...assignData, floor: val })}
                                                placeholder="Kat Seçin..."
                                                disabled={!assignData.blockId}
                                                className="text-xs"
                                            />
                                        </div>

                                        <div className="col-span-2">
                                            <label className="block text-[10px] font-bold text-black uppercase mb-2">Tahsis Alanı (m²)</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    className="w-full p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black outline-none focus:border-indigo-500 text-black transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    value={assignData.area === 0 ? '' : assignData.area}
                                                    max={selectedFloorStats?.remaining || undefined}
                                                    onChange={e => {
                                                        let val = parseFloat(e.target.value);
                                                        if (selectedFloorStats && val > selectedFloorStats.remaining) {
                                                            val = selectedFloorStats.remaining;
                                                        }
                                                        setAssignData({ ...assignData, area: val });
                                                    }}
                                                />
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">m²</div>
                                            </div>

                                            {estimatedRent > 0 && (
                                                <div className="mt-2 flex justify-end">
                                                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                                        <Calculator className="w-3.5 h-3.5" />
                                                        <span className="text-xs font-bold uppercase tracking-wide">Tahmini Kira:</span>
                                                        <span className="text-sm font-black">{formatCurrency(estimatedRent, isPresentationMode)} TL</span>
                                                    </div>
                                                </div>
                                            )}

                                            {selectedFloorStats && (
                                                <div className="mt-2">
                                                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex shadow-inner border border-slate-200">
                                                        <div
                                                            className={`h-full transition-all duration-500 ${(() => {
                                                                const pct = (selectedFloorStats.used / selectedFloorStats.total) * 100;
                                                                if (pct >= 90) return 'bg-rose-500';
                                                                if (pct >= 75) return 'bg-orange-500';
                                                                if (pct >= 50) return 'bg-amber-400';
                                                                return 'bg-emerald-500';
                                                            })()}`}
                                                            style={{ width: `${(selectedFloorStats.used / selectedFloorStats.total) * 100}%` }}
                                                            title={`Mevcut Dolu: ${selectedFloorStats.used.toFixed(1)} m²`}
                                                        />
                                                        {assignData.area > 0 && (
                                                            <div
                                                                className="h-full bg-orange-400 bg-[length:10px_10px] bg-[linear-gradient(45deg,rgba(255,255,255,.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.15)_50%,rgba(255,255,255,.15)_75%,transparent_75%,transparent)] animate-pulse transition-all duration-300"
                                                                style={{ width: `${(assignData.area / selectedFloorStats.total) * 100}%` }}
                                                                title={`Yeni Tahsis: ${assignData.area} m²`}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="flex justify-end items-center mt-1.5">
                                                        <span className="text-[10px] font-black text-black">
                                                            Kalan Müsait Alan: {selectedFloorStats.remaining.toFixed(1)} m²
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="col-span-2 pt-2">
                                            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-indigo-300 transition-colors group">
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${assignData.isReserved ? 'border-indigo-600' : 'border-gray-300'}`}>
                                                    {assignData.isReserved && <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />}
                                                </div>
                                                <span className="text-sm font-bold text-gray-600 group-hover:text-gray-900">Bu alanı rezerve et</span>
                                                <input type="checkbox" className="hidden" checked={assignData.isReserved} onChange={e => setAssignData({ ...assignData, isReserved: e.target.checked })} />
                                            </label>
                                        </div>

                                        <AnimatePresence>
                                            {assignData.isReserved && (
                                                <>
                                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="col-span-1">
                                                        <label className="block text-[10px] font-bold text-black uppercase mb-2 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Rezerve Süresi (Gün)</label>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                placeholder="30"
                                                                className="w-full p-2.5 md:p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-bold outline-none focus:border-amber-400 text-amber-800 placeholder-amber-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                value={assignData.reservationDuration}
                                                                onChange={e => setAssignData({ ...assignData, reservationDuration: sanitizeInput(e.target.value) })}
                                                            />
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-amber-400 text-xs">Gün</div>
                                                        </div>
                                                    </motion.div>
                                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="col-span-1">
                                                        <label className="block text-[10px] font-bold text-black uppercase mb-2 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Rezerve Ücreti</label>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                placeholder="0"
                                                                className="w-full p-2.5 md:p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-bold outline-none focus:border-amber-400 text-amber-800 placeholder-amber-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                value={assignData.reservationFee}
                                                                onChange={e => setAssignData({ ...assignData, reservationFee: parseFloat(e.target.value) || 0 })}
                                                            />
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-amber-400 text-xs">TL</div>
                                                        </div>
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                                <div className="pt-6 border-t border-slate-100 flex justify-end gap-3 mt-4 flex-wrap"><Button variant="ghost" onClick={() => setIsAssignModalOpen(false)} className="flex-1 md:flex-none">İptal</Button><Button onClick={handleAssignSubmit} disabled={!assignData.companyId || !assignData.area || !assignData.floor} className="px-8 py-3 flex-1 md:flex-none">{assignData.isReserved ? 'Rezerve Et' : 'Tahsisat Oluştur'}</Button></div>
                            </div>
                        </div>
                    </div>, document.body
                )
            }

            {/* Interactive Tutorial System */}
            {
                showHelp && createPortal(
                    <div className="fixed inset-0 z-[10000] pointer-events-auto isolate">
                        {/* Backdrop */}
                        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[10000]" onClick={() => setShowHelp(false)} />

                        {/* Dynamic Highlighter & Clone Button */}
                        {targetRect && (
                            <div
                                className="fixed z-[10001] transition-all duration-300 ease-out pointer-events-none"
                                style={{
                                    top: targetRect.top,
                                    left: targetRect.left,
                                    width: targetRect.width,
                                    height: targetRect.height,
                                }}
                            >
                                {/* Pulse Effect Background */}
                                <div className="absolute inset-0 -m-1 bg-white/20 rounded-xl animate-pulse ring-4 ring-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.6)]"></div>

                                {/* Clone of the Active Button for High Visibility */}
                                <Button
                                    variant={helpSlide === 2 ? "primary" : "secondary"}
                                    className={`w-full h-full text-[10px] sm:text-xs font-bold !ring-0 !outline-none shadow-none pointer-events-none relative z-10 ${helpSlide === 2 ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900'}`}
                                >
                                    {helpSlide === 0 && <><Plus className="w-3.5 h-3.5 mr-1" /> Kampüs Ekle</>}
                                    {helpSlide === 1 && <><Building className="w-3.5 h-3.5 mr-1" /> Blok Ekle</>}
                                    {helpSlide === 2 && <><Plus className="w-3.5 h-3.5 mr-1" /> Firma Ekle</>}
                                </Button>
                            </div>
                        )}

                        {/* Tutorial Cards - Positioned Relative to Target */}
                        {targetRect && (
                            <div
                                className="fixed z-[10002] bg-white rounded-2xl shadow-2xl p-5 max-w-xs border-2 border-indigo-500 animate-in fade-in zoom-in-95 duration-300"
                                style={{
                                    top: targetRect.bottom + 16,
                                    left: Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 160), window.innerWidth - 340) // Center horizontally
                                }}
                            >
                                {/* Arrow pointing up to button */}
                                <div
                                    className="absolute -top-2 w-4 h-4 bg-white border-t-2 border-l-2 border-indigo-500 transform rotate-45"
                                    style={{ left: Math.min(Math.max(20, (targetRect.left - Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 160), window.innerWidth - 340)) + (targetRect.width / 2) - 8), 280) }}
                                ></div>

                                {helpSlide === 0 && (
                                    <>
                                        <div className="flex items-start gap-3 mb-3">
                                            <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                                                <MapPin className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 text-base">1. Kampüs Oluşturma</h3>
                                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">Kampüs, yönetilen en büyük fiziksel yapıyı temsil eder. İşe yeni bir kampüs oluşturarak başlayabilirsiniz.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Atla</button>
                                            <button onClick={() => setHelpSlide(1)} className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">Sıradaki</button>
                                        </div>
                                    </>
                                )}

                                {helpSlide === 1 && (
                                    <>
                                        <div className="flex items-start gap-3 mb-3">
                                            <div className="p-2 bg-emerald-100 rounded-lg shrink-0">
                                                <Building className="w-5 h-5 text-emerald-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 text-base">2. Blok Tanımlama</h3>
                                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">Her kampüsün içerisine dilediğiniz kadar blok (bina) ekleyebilirsiniz.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Atla</button>
                                            <button onClick={() => setHelpSlide(2)} className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200">Sıradaki</button>
                                        </div>
                                    </>
                                )}

                                {helpSlide === 2 && (
                                    <>
                                        <div className="flex items-start gap-3 mb-3">
                                            <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                                                <Users className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 text-base">3. Firma Atama</h3>
                                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">Tanımladığınız bloklara ve firmaları yerleştirebilir, doluluk oranlarını takip edebilirsiniz.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Kapat</button>
                                            <button onClick={() => { setShowHelp(false); setHelpSlide(0); }} className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">Anladım</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>, document.body
                )
            }

            {/* Floating Tutorial Button */}
            <button
                onClick={() => { setShowHelp(true); setHelpSlide(0); }}
                className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group z-[9000]"
                title="Fiziksel Yapı Rehberi"
            >
                <Info className="w-7 h-7 group-hover:scale-110 transition-transform" />
            </button>


            {
                editBlockModal && !editBlockConfirmChanges && createPortal(
                    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
                        >
                            <div className="p-6 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex justify-between items-center shrink-0 shadow-lg z-10">
                                <div>
                                    <h3 className="text-xl font-bold">Blok Düzenle</h3>
                                    <p className="text-indigo-200 text-xs font-bold mt-1">Blok bilgilerini ve kat kapasitelerini güncelleyin.</p>
                                </div>
                                <button onClick={() => { setEditBlockModal(null); setEditBlockError(null); }} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"><X className="w-6 h-6" /></button>
                            </div>

                            <div className="p-6 sm:p-8 space-y-6 overflow-y-auto custom-scrollbar bg-slate-50/50">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Blok Adı</label>
                                        <input
                                            type="text"
                                            autoFocus
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-bold outline-none transition-all bg-white shadow-sm text-black"
                                            value={editBlockModal.name}
                                            onChange={e => setEditBlockModal({ ...editBlockModal, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">İşletme Ücreti (TL)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-bold outline-none transition-all bg-white shadow-sm text-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                value={editBlockModal.defaultOperatingFee}
                                                onChange={e => setEditBlockModal({ ...editBlockModal, defaultOperatingFee: parseFloat(e.target.value) || 0 })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">TL / Ay</span>
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-medium mt-1.5 ml-1">Bu bloktaki tüm firmalara otomatik uygulanır.</p>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">m² Başına İşçi Hakkı</label>
                                    <div className="flex items-center gap-4">
                                        <div className="relative flex-1">
                                            <input
                                                type="number"
                                                min="1"
                                                step="0.5"
                                                className={`w-full px-4 py-3 border rounded-xl focus:ring-4 font-bold outline-none transition-all bg-white shadow-sm text-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${editBlockModal.sqMPerEmployee < 1 ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10' : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/10'}`}
                                                value={editBlockModal.sqMPerEmployee || ''}
                                                onChange={e => setEditBlockModal({ ...editBlockModal, sqMPerEmployee: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">m² / Kişi</span>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className={`text-sm font-black ${editBlockModal.sqMPerEmployee >= 1 ? 'text-indigo-600' : 'text-rose-500'}`}>{editBlockModal.sqMPerEmployee || '—'} m²</div>
                                            <div className="text-[9px] font-bold text-gray-400">her çalışan için</div>
                                        </div>
                                    </div>
                                    {editBlockModal.sqMPerEmployee < 1 ? (
                                        <p className="text-[10px] text-rose-500 font-bold mt-1.5 ml-1">⚠ 1 veya üzeri bir değer girilmelidir.</p>
                                    ) : (
                                        <p className="text-[10px] text-gray-400 font-medium mt-1.5 ml-1">Her çalışan için gereken minimum alan. Örn: {editBlockModal.sqMPerEmployee} m² başına 1 kişi düşer.</p>
                                    )}
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
                                        <div>
                                            <h4 className="font-bold text-gray-900 text-sm">Kat Kapasiteleri</h4>
                                            <p className="text-[10px] text-gray-400 font-bold mt-1">Her katın m² kapasitesini düzenleyin</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-black text-indigo-600">{editBlockModal.floorCapacities.reduce((s, f) => s + f.totalSqM, 0).toLocaleString()} m²</div>
                                            <div className="text-[9px] font-bold text-gray-400 uppercase">Toplam Kapasite</div>
                                        </div>
                                    </div>

                                    <div className="divide-y divide-gray-50 max-h-[350px] overflow-y-auto custom-scrollbar">
                                        {editBlockModal.floorCapacities.map((fc, idx) => {
                                            const floorUnits = units.filter(u => u.blockId === editBlockModal.blockId && u.floor === fc.floor);
                                            const usedArea = floorUnits.reduce((sum, u) => sum + u.areaSqM, 0);
                                            const usagePercent = fc.totalSqM > 0 ? Math.min(100, (usedArea / fc.totalSqM) * 100) : 0;
                                            const orig = editBlockOriginal.current?.floorCapacities.find(f => f.floor === fc.floor);
                                            const diff = orig ? fc.totalSqM - orig.totalSqM : 0;
                                            return (
                                                <div key={fc.floor} className="px-5 py-4 hover:bg-slate-50/80 transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className="min-w-[90px]">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-black shadow-sm">{fc.floor}</div>
                                                                <div>
                                                                    <span className="text-xs font-black text-gray-800">{fc.floor}. Kat</span>
                                                                    {usedArea > 0 && <div className="text-[9px] font-bold text-gray-400">{usedArea.toFixed(1)} m² dolu</div>}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-3">
                                                                <button
                                                                    onClick={() => {
                                                                        const updated = [...editBlockModal.floorCapacities];
                                                                        const newVal = Math.max(0, updated[idx].totalSqM - 10);
                                                                        if (newVal < usedArea) {
                                                                            setEditBlockError(`${fc.floor}. katın ${usedArea.toFixed(1)} metrekaresi aktif kullanılmakta. Bu işleme devam etmek için katta tanımlı olan firmaları kaldırmanız gerekmektedir.`);
                                                                            return;
                                                                        }
                                                                        updated[idx] = { ...updated[idx], totalSqM: newVal };
                                                                        setEditBlockModal({ ...editBlockModal, floorCapacities: updated });
                                                                        setEditBlockError(null);
                                                                    }}
                                                                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-rose-500 hover:text-white text-gray-500 transition-all flex items-center justify-center shadow-sm hover:shadow-md active:scale-95"
                                                                >
                                                                    <Minus className="w-3.5 h-3.5" />
                                                                </button>
                                                                <div className="flex-1 relative">
                                                                    <input
                                                                        type="number"
                                                                        className="w-full text-center text-sm font-black text-gray-900 outline-none bg-white border-2 border-gray-200 rounded-xl px-3 py-2 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                        value={fc.totalSqM === 0 ? '' : fc.totalSqM}
                                                                        onChange={(e) => {
                                                                            const val = parseFloat(e.target.value) || 0;
                                                                            const updated = [...editBlockModal.floorCapacities];
                                                                            updated[idx] = { ...updated[idx], totalSqM: val };
                                                                            setEditBlockModal({ ...editBlockModal, floorCapacities: updated });
                                                                            if (val < usedArea && usedArea > 0) {
                                                                                setEditBlockError(`${fc.floor}. katın ${usedArea.toFixed(1)} metrekaresi aktif kullanılmakta. Bu işleme devam etmek için katta tanımlı olan firmaları kaldırmanız gerekmektedir.`);
                                                                            } else {
                                                                                setEditBlockError(null);
                                                                            }
                                                                        }}
                                                                    />
                                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">m²</span>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const updated = [...editBlockModal.floorCapacities];
                                                                        updated[idx] = { ...updated[idx], totalSqM: updated[idx].totalSqM + 10 };
                                                                        setEditBlockModal({ ...editBlockModal, floorCapacities: updated });
                                                                        setEditBlockError(null);
                                                                    }}
                                                                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-emerald-500 hover:text-white text-gray-500 transition-all flex items-center justify-center shadow-sm hover:shadow-md active:scale-95"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                            {/* Progress bar */}
                                                            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-500 ${usagePercent >= 90 ? 'bg-gradient-to-r from-rose-400 to-rose-500' : usagePercent >= 60 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'}`}
                                                                    style={{ width: `${usagePercent}%` }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {diff !== 0 && (
                                                            <span className={`text-[10px] font-black px-2 py-1 rounded-full ${diff > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                                {diff > 0 ? '+' : ''}{diff} m²
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {editBlockError && (
                                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                        <p className="text-sm font-bold text-rose-700">{editBlockError}</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-5 border-t bg-gray-50/80 flex justify-between items-center shrink-0">
                                <div className="text-xs font-bold text-gray-500">
                                    {editBlockModal.floorCapacities.length} Kat · {editBlockModal.floorCapacities.reduce((s, f) => s + f.totalSqM, 0).toLocaleString()} m²
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="ghost" onClick={() => { setEditBlockModal(null); setEditBlockError(null); }}>İptal</Button>
                                    <Button
                                        disabled={editBlockModal.sqMPerEmployee < 1 || !!editBlockError || !editBlockModal.name}
                                        onClick={() => {
                                            // Build change summary
                                            const changes: { label: string; type: 'increase' | 'decrease' | 'info' }[] = [];
                                            const orig = editBlockOriginal.current;
                                            if (!orig) return;

                                            if (editBlockModal.name !== orig.name) {
                                                changes.push({ label: `Blok adı “${orig.name}” → “${editBlockModal.name}” olarak değiştirildi`, type: 'info' });
                                            }
                                            if (editBlockModal.defaultOperatingFee !== orig.defaultOperatingFee) {
                                                changes.push({ label: `İşletme ücreti ${orig.defaultOperatingFee} TL → ${editBlockModal.defaultOperatingFee} TL olarak değiştirildi`, type: editBlockModal.defaultOperatingFee > orig.defaultOperatingFee ? 'increase' : 'decrease' });
                                            }
                                            if (editBlockModal.sqMPerEmployee !== orig.sqMPerEmployee) {
                                                changes.push({ label: `m² başına işçi hakkı ${orig.sqMPerEmployee} → ${editBlockModal.sqMPerEmployee} olarak değiştirildi`, type: 'info' });
                                            }
                                            editBlockModal.floorCapacities.forEach(fc => {
                                                const origFc = orig.floorCapacities.find(f => f.floor === fc.floor);
                                                if (origFc && fc.totalSqM !== origFc.totalSqM) {
                                                    const diff = fc.totalSqM - origFc.totalSqM;
                                                    changes.push({
                                                        label: `${fc.floor}. kat ${Math.abs(diff)} m² ${diff > 0 ? 'artırıldı' : 'azaltıldı'} (${origFc.totalSqM} → ${fc.totalSqM} m²)`,
                                                        type: diff > 0 ? 'increase' : 'decrease'
                                                    });
                                                }
                                            });

                                            if (changes.length === 0) {
                                                // Nothing changed, just close
                                                setEditBlockModal(null);
                                                return;
                                            }
                                            setEditBlockConfirmChanges({ changes });
                                        }}
                                        className={`px-6 ${editBlockError || editBlockModal.sqMPerEmployee < 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        Kaydet
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>,
                    document.body
                )
            }

            {/* Block Edit Confirmation Dialog */}
            {
                editBlockConfirmChanges && editBlockModal && createPortal(
                    <div className="fixed inset-0 z-[10003] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        >
                            <div className="p-6 bg-gradient-to-r from-indigo-600 to-violet-600 text-center">
                                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Info className="w-7 h-7 text-white" />
                                </div>
                                <h3 className="text-lg font-black text-white">Değişiklikleri Onayla</h3>
                                <p className="text-indigo-200 text-xs font-bold mt-1">{editBlockModal.name} bloğunda aşağıdaki değişiklikler uygulanacak</p>
                            </div>
                            <div className="p-5 space-y-2.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                                {editBlockConfirmChanges.changes.map((c, i) => (
                                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-bold ${c.type === 'increase' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                        c.type === 'decrease' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                                            'bg-indigo-50 border-indigo-200 text-indigo-700'
                                        }`}>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${c.type === 'increase' ? 'bg-emerald-500 text-white' :
                                            c.type === 'decrease' ? 'bg-rose-500 text-white' :
                                                'bg-indigo-500 text-white'
                                            }`}>
                                            {c.type === 'increase' ? <Plus className="w-3.5 h-3.5" /> : c.type === 'decrease' ? <Minus className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                        </div>
                                        <span>{c.label}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 bg-gray-50 flex gap-3 border-t border-gray-100">
                                <Button variant="ghost" className="flex-1 font-bold text-gray-500" onClick={() => setEditBlockConfirmChanges(null)}>
                                    Hayır, Vazgeç
                                </Button>
                                <Button className="flex-1 font-bold shadow-lg shadow-indigo-200" onClick={async () => {
                                    try {
                                        await api.updateBlock(editBlockModal.blockId, {
                                            name: editBlockModal.name,
                                            defaultOperatingFee: editBlockModal.defaultOperatingFee,
                                            sqMPerEmployee: editBlockModal.sqMPerEmployee,
                                            floorCapacities: editBlockModal.floorCapacities
                                        });
                                        if (selectedCampus) await fetchBlocks(selectedCampus.id);
                                        setEditBlockModal(null);
                                        setEditBlockError(null);
                                        setEditBlockConfirmChanges(null);
                                    } catch (err: any) {
                                        setEditBlockConfirmChanges(null);
                                        setEditBlockError(err.message);
                                    }
                                }}>
                                    Evet, Onayla
                                </Button>
                            </div>
                        </motion.div>
                    </div>,
                    document.body
                )
            }
        </div >
    );
};
