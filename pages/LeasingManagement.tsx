import React, { useState, useMemo, useRef, memo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useDebounce } from '../utils/hooks';
import { Search, MapPin, Layers, Briefcase, Calendar, X, Award, FileText, Upload, Check, Building, Building2, TrendingUp, Users, User, ChevronRight, Hash, Phone, Mail, Paperclip, CloudUpload, DollarSign, LayoutGrid, Plus, Download, Filter, Edit3, Save, AlertTriangle, Calculator, AlertCircle, Minus, Trash2, CheckCircle2, File, MessageSquare, ShieldCheck, Tag, ChevronDown, PlusCircle, Settings, Info, Loader2, Image } from 'lucide-react';
import { Button } from '../components/Button';
import { Company, Lease, Unit, Block, Campus, LeaseDocument, ExtendedLeaseData } from '../types';
import AnimatedList from '../components/AnimatedList';
import { motion, AnimatePresence } from 'motion/react';
import Folder from '../components/Folder';
import { Dropdown } from '../components/Dropdown';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/format';
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

const SCORE_CATEGORIES = [
    {
        id: 'ARGE_NITELIK',
        label: 'Ar-Ge Niteliği Artırma',
        maxPoints: 28,
        items: [
            { label: 'AB Projesi (Başvuru veya Devam Eden)', points: 7 },
            { label: 'TÜBİTAK Projesi (Başvuru veya Devam Eden)', points: 6 },
            { label: 'Akademisyen İşbirliği', points: 5 },
            { label: 'Fikri/Sınai Mülkiyet (Uluslararası)', points: 5 },
            { label: 'Fikri/Sınai Mülkiyet (Diğer/Ulusal)', points: 4 },
            { label: 'Fikri/Sınai Mülkiyet (Başvuru)', points: 2 },
            { label: 'Teknokent Proje Hakem Ort. (90 ve üzeri)', points: 5 }
        ]
    },
    {
        id: 'HIZMET_ALMA',
        label: 'Dijitalpark’tan Hizmet Alma',
        maxPoints: 23,
        items: [
            { label: 'Mentorluk Alma', points: 2 },
            { label: 'Eğitim Faaliyetlerine Katılım', points: 2 },
            { label: 'Proje Yazdırma (AR Projesi)', points: 10 }
        ]
    },
    {
        id: 'TEKNOKENT_SUREC',
        label: 'Teknokent Süreçlerine Destek veya Katılım',
        maxPoints: 20,
        items: [
            { label: 'Teknokent Etkinliklerine Katılım', points: 5 },
            { label: 'Üniversite Sanayi İşbirliği Portalı Kaydı', points: 5 },
            { label: 'Stajyer İstihdamı', points: 5 },
            { label: 'Teknokent Yönetimine Raporlama', points: 5 }
        ]
    },
    {
        id: 'ULUSLARARASILASMA',
        label: 'Uluslararasılaşma',
        maxPoints: 15,
        items: [
            { label: 'Yurtdışı Fuar Katılımı', points: 5 },
            { label: 'Yurtdışı Ofis/Şube Açılışı', points: 5 },
            { label: 'İhracat Yapılması', points: 5 }
        ]
    },
    {
        id: 'IDARI_ISLER',
        label: 'Teknokent İdari İşleri',
        maxPoints: 14,
        items: [
            { label: 'Kira/İşletme Gideri Düzenli Ödeme', points: 7 },
            { label: 'Yönetim Kurulu Kararlarına Uyum', points: 7 }
        ]
    }
];

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

// --- Helper for Mandatory Fields ---
const RequiredMark = () => (
    <div className="group relative inline-flex ml-1 cursor-help align-text-bottom">
        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-slate-800 text-white text-[10px] font-bold py-1 px-2 rounded shadow-xl whitespace-nowrap z-50">
            Bu alanı doldurmak zorunludur
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
        </div>
    </div>
);

// --- SECURITY UTILS ---

const sanitizeFilename = (filename: string) => {
    // Sadece işletim sistemleri ve dizin geçişleri için tehlikeli olan karakterleri temizler.
    // Türkçe karakterleri ve boşlukları orijinal haliyle korur.
    return filename.replace(/[<>\:"/\\|?*\x00-\x1F]/g, "_");
};

const validateFileSecurity = (file: File) => {
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB Limit
    const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
    const ALLOWED_MIME_TYPES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream'
    ];

    if (file.size > MAX_SIZE) {
        return "Dosya boyutu 5MB sınırını aşamaz.";
    }

    const parts = file.name.split('.');
    const ext = parts.pop()?.toLowerCase();

    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        return "Geçersiz dosya uzantısı. Sadece PDF, Word, JPG ve PNG dosyaları.";
    }

    const dangerousExtensions = ['php', 'exe', 'sh', 'bat', 'js', 'html', 'svg', 'dll', 'jar'];
    if (parts.some(part => dangerousExtensions.includes(part.toLowerCase()))) {
        return "Güvenlik riski: Dosya isminde şüpheli uzantılar/karakterler tespit edildi.";
    }

    if (file.name.length > 255) {
        return "Dosya ismi çok uzun.";
    }

    // Checking mime-type, but allowing empty on Windows if extension is known
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
        return "Dosya formatı güvenlik politikası ile eşleşmiyor (MIME type mismatch).";
    }

    return null;
};

// --- Helper Functions for Formatting ---

const formatPhoneNumber = (val: string) => {
    let raw = val.replace(/\D/g, '');
    if (raw.startsWith('0')) {
        raw = raw.slice(1);
    }
    raw = raw.slice(0, 10);

    if (raw.length > 8) {
        return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6, 8)} ${raw.slice(8)} `;
    } else if (raw.length > 6) {
        return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)} `;
    } else if (raw.length > 3) {
        return `${raw.slice(0, 3)} ${raw.slice(3)} `;
    } else {
        return raw;
    }
};

const toTitleCaseTurkish = (str: string) => {
    return str.split(' ').map(word => {
        if (word.length === 0) return '';
        return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
    }).join(' ');
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Add Lease Modal Component ---
const AddLeaseModal: React.FC<{ onClose: () => void; onSuccess: () => void; }> = ({ onClose, onSuccess }) => {
    const [error, setError] = useState<string | null>(null);
    const [showSecPhone, setShowSecPhone] = useState(false);
    const [showSecEmail, setShowSecEmail] = useState(false);

    const [formData, setFormData] = useState({
        companyName: '',
        sector: '',
        managerName: '',
        managerPhone: '',
        secManagerPhone: '',
        managerEmail: '',
        secManagerEmail: '',
        rentPerSqm: 0,
        startDate: '',
        endDate: '',
    });

    const [sectors, setSectors] = useState<string[]>([]);
    const [showSectorSuggestions, setShowSectorSuggestions] = useState(false);
    const [isLoadingSectors, setIsLoadingSectors] = useState(false);

    useEffect(() => {
        const fetchSectors = async () => {
            setIsLoadingSectors(true);
            try {
                const data = await api.getSectors();
                setSectors(data || []);
            } catch (err) {
                console.error('Failed to fetch sectors:', err);
                setSectors([]);
            } finally {
                setIsLoadingSectors(false);
            }
        };
        fetchSectors();
    }, []);

    const filteredSectors = useMemo(() => {
        if (!formData.sector) return sectors;
        return sectors.filter(s => s.toLocaleLowerCase('tr-TR').includes(formData.sector.toLocaleLowerCase('tr-TR')));
    }, [formData.sector, sectors]);

    const isValid = useMemo(() => {
        if (!formData.companyName || !formData.sector) return false;
        if (!formData.managerName) return false;
        if (formData.rentPerSqm <= 0) return false;
        if (!formData.managerPhone && !formData.managerEmail) return false;
        if (formData.managerEmail && !emailRegex.test(formData.managerEmail)) return false;
        if (formData.managerPhone && formData.managerPhone.replace(/\D/g, '').length < 10) return false;
        return true;
    }, [formData]);

    const formatDateInput = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 2) return numbers;
        if (numbers.length <= 4) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
        return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
    };

    const convertToISO = (dateStr: string) => {
        if (!dateStr || dateStr.length !== 10) return '';
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month}-${day}`;
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'managerPhone' | 'secManagerPhone') => {
        const formatted = formatPhoneNumber(e.target.value);
        setFormData(prev => ({ ...prev, [field]: formatted }));
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const val = e.target.value;
        const safeVal = sanitizeInput(val);
        setFormData(prev => ({ ...prev, [field]: toTitleCaseTurkish(safeVal) }));
    };

    const handleSubmit = async () => {
        setError(null);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (formData.endDate.length === 10) {
            const endISO = convertToISO(formData.endDate);
            const endDateObj = new Date(endISO);
            if (endDateObj < today) {
                setError("Sözleşme bitiş tarihi geçmiş bir tarih olamaz.");
                return;
            }
        }

        if (formData.startDate.length === 10 && formData.endDate.length === 10) {
            const startISO = convertToISO(formData.startDate);
            const endISO = convertToISO(formData.endDate);
            if (new Date(startISO) > new Date(endISO)) {
                setError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
                return;
            }
        }

        try {
            const finalPhone = formData.secManagerPhone
                ? `${formData.managerPhone} | ${formData.secManagerPhone}`
                : formData.managerPhone;
            const finalEmail = formData.secManagerEmail
                ? `${formData.managerEmail} | ${formData.secManagerEmail}`
                : formData.managerEmail;

            if (formData.sector) {
                try {
                    await api.addSector(formData.sector);
                } catch (e) {
                    // Ignore error if sector already exists
                }
            }

            await api.registerCompany({
                name: sanitizeInput(formData.companyName),
                registrationNumber: `TR-${Math.floor(Math.random() * 900000) + 100000}`,
                sector: sanitizeInput(formData.sector),
                businessAreas: [sanitizeInput(formData.sector)], // Default to sector
                managerName: sanitizeInput(formData.managerName),
                managerPhone: sanitizeInput(finalPhone),
                managerEmail: sanitizeInput(finalEmail),
                employeeCount: 0,
                contractTemplate: {
                    rentPerSqM: formData.rentPerSqm,
                    startDate: convertToISO(formData.startDate) || new Date().toISOString(),
                    endDate: convertToISO(formData.endDate) || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
                }
            });
            // Trigger event for Dashboard to refresh
            triggerDataChange('company', 'create');
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="px-5 py-3 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Plus className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-lg font-bold text-gray-900 leading-tight">Yeni Sözleşme Ekle</h2>
                            <p className="text-xs text-gray-500 font-medium">Ofis tahsisinden önce firma ve kira şartlarını oluşturun.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-4 overflow-y-auto custom-scrollbar flex-1 overflow-x-hidden">
                    {error && (
                        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-600 animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span className="text-xs font-bold">{error}</span>
                        </div>
                    )}
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-8">
                                <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase mb-1">
                                    Firma Adı <RequiredMark />
                                </label>
                                <div className="relative">
                                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                                        placeholder="Şirket Ünvanı"
                                        value={formData.companyName}
                                        onChange={(e) => handleTextChange(e, 'companyName')}
                                    />
                                </div>
                            </div>
                            <div className="md:col-span-4">
                                <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase mb-1">
                                    Sektör <RequiredMark />
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                                        placeholder="Örn: Yazılım"
                                        value={formData.sector}
                                        onChange={(e) => {
                                            handleTextChange(e, 'sector');
                                            setShowSectorSuggestions(true);
                                        }}
                                        onFocus={() => setShowSectorSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowSectorSuggestions(false), 200)}
                                    />
                                    {showSectorSuggestions && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                                            {filteredSectors.map((sector, index) => (
                                                <button
                                                    key={index}
                                                    className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                                    onClick={() => {
                                                        setFormData(prev => ({ ...prev, sector: sector }));
                                                        setShowSectorSuggestions(false);
                                                    }}
                                                >
                                                    {sector}
                                                </button>
                                            ))}
                                            {formData.sector && !filteredSectors.some(s => s.toLocaleLowerCase('tr-TR') === formData.sector.toLocaleLowerCase('tr-TR')) && (
                                                <button
                                                    className="w-full text-left px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 transition-colors flex items-center gap-2"
                                                    onClick={() => {
                                                        setShowSectorSuggestions(false);
                                                    }}
                                                >
                                                    <Plus className="w-3 h-3" /> "{formData.sector}" Ekle
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase mb-1">
                                    Yönetici Adı Soyadı <RequiredMark />
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 outline-none"
                                        placeholder="Ad Soyad"
                                        value={formData.managerName}
                                        onChange={(e) => handleTextChange(e, 'managerName')}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase">Telefon</label>
                                        <button onClick={() => setShowSecPhone(!showSecPhone)} className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1">
                                            {showSecPhone ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />} {showSecPhone ? 'Kaldır' : 'İkincil Ekle'}
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input type="text" className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 outline-none" placeholder="5XX XXX XX XX" value={formData.managerPhone} onChange={(e) => handlePhoneChange(e, 'managerPhone')} />
                                    </div>
                                    {showSecPhone && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <input type="text" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 outline-none" placeholder="İkincil Telefon" value={formData.secManagerPhone} onChange={(e) => handlePhoneChange(e, 'secManagerPhone')} />
                                        </motion.div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase">E-Posta</label>
                                        <button onClick={() => setShowSecEmail(!showSecEmail)} className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1">
                                            {showSecEmail ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />} {showSecEmail ? 'Kaldır' : 'İkincil Ekle'}
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input type="email" className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 outline-none invalid:border-rose-300 invalid:text-rose-600 focus:invalid:ring-rose-500" placeholder="isim@firma.com" value={formData.managerEmail} onChange={e => setFormData({ ...formData, managerEmail: sanitizeInput(e.target.value) })} />
                                    </div>
                                    {showSecEmail && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <input type="email" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 outline-none" placeholder="İkincil E-Posta" value={formData.secManagerEmail} onChange={e => setFormData({ ...formData, secManagerEmail: sanitizeInput(e.target.value) })} />
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                            <h4 className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Calculator className="w-3.5 h-3.5" /> Sözleşme Şartları
                            </h4>
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase mb-1">
                                        Anlaşılan Birim Fiyat (TL/m²) <RequiredMark />
                                    </label>
                                    <div className="relative">
                                        <input type="number" min="0" className="w-full p-2 border border-gray-300 rounded-lg text-lg font-black text-black bg-white focus:border-indigo-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.rentPerSqm === 0 ? '' : formData.rentPerSqm} onChange={e => setFormData({ ...formData, rentPerSqm: parseFloat(e.target.value) || 0 })} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">TL / m²</span>
                                    </div>
                                    <p className="text-[10px] text-emerald-600 mt-2 font-medium">* Toplam kira bedeli, Bina Yönetimi sayfasından ofis alanı seçildiğinde otomatik hesaplanacaktır.</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                            <div>
                                <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase mb-1">
                                    Başlangıç Tarihi <span className="text-[9px] text-gray-400 normal-case ml-1 font-medium">(Opsiyonel)</span>
                                </label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                    <input type="text" placeholder="GG/AA/YYYY" maxLength={10} className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-900 bg-white focus:border-indigo-500 outline-none" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: formatDateInput(e.target.value) })} />
                                </div>
                            </div>
                            <div>
                                <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase mb-1">
                                    Bitiş Tarihi <span className="text-[9px] text-gray-400 normal-case ml-1 font-medium">(Opsiyonel)</span>
                                </label>
                                <div className="relative">
                                    <Calendar className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${formData.startDate.length < 10 ? 'text-gray-300' : 'text-gray-400'} pointer-events-none`} />
                                    <input type="text" placeholder="GG/AA/YYYY" maxLength={10} disabled={formData.startDate.length < 10} className={`w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-900 bg-white focus:border-indigo-500 outline-none ${formData.startDate.length < 10 ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`} value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: formatDateInput(e.target.value) })} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 shrink-0">
                    <Button variant="ghost" onClick={onClose} className="font-bold text-gray-500 h-9 text-xs">İptal</Button>
                    <Button onClick={handleSubmit} disabled={!isValid} className="bg-indigo-600 hover:bg-indigo-700 font-bold px-6 h-9 text-xs">
                        <Save className="w-4 h-4 mr-2" /> Sözleşmeyi Oluştur
                    </Button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

const DeleteConfirmModal: React.FC<{ isOpen: boolean; title: string; onClose: () => void; onConfirm: () => void; }> = ({ isOpen, title, onClose, onConfirm }) => {
    const [confirmText, setConfirmText] = useState('');

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center"
            >
                <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 className="w-8 h-8 text-rose-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 mb-6">
                    Bu işlem geri alınamaz. Devam etmek için lütfen aşağıya <span className="font-bold text-rose-600">ONAYLIYORUM</span> yazın.
                </p>

                <input
                    type="text"
                    className="w-full p-3 border-2 border-gray-200 rounded-xl text-center font-bold text-black focus:border-rose-500 focus:outline-none mb-6 uppercase"
                    placeholder="ONAYLIYORUM"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                />

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors">
                        İptal
                    </button>
                    <button
                        disabled={confirmText !== 'ONAYLIYORUM'}
                        onClick={onConfirm}
                        className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-lg shadow-rose-500/20"
                    >
                        Sil
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

const LeaseRowItem = memo(({ item, isSelected, onClick, onDelete }: { item: ExtendedLeaseData, isSelected: boolean, onClick: () => void, onDelete: () => void }) => {
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
                    {item.lease.monthlyRent === 0 ? '-' : formatCurrency(item.lease.monthlyRent, isPresentationMode)} {item.lease.monthlyRent === 0 ? '' : (isPending ? 'TL/m²' : 'TL')}
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

export const CompanyDetailModal: React.FC<{ data: ExtendedLeaseData; onClose: () => void; onUpdate: () => void; }> = ({ data, onClose, onUpdate }) => {
    const [activeTab, setActiveTab] = useState<'INFO' | 'SCORE' | 'CONTRACTS' | 'WORK_AREAS'>('INFO');
    const isUnallocated = data.lease.id === 'PENDING' || !data.lease.unitId;
    // ... (rest of state remain same)
    const [newScore, setNewScore] = useState({ categoryId: '', itemId: -1, points: 0, desc: '' });
    const [activeDropdown, setActiveDropdown] = useState<'category' | 'item' | null>(null);
    const [newScoreDocuments, setNewScoreDocuments] = useState<LeaseDocument[]>([]);
    const [scoreNote, setScoreNote] = useState('');
    const [scoreUploadError, setScoreUploadError] = useState<string | null>(null);
    const { isPresentationMode } = useTheme();

    const [isEditMode, setIsEditMode] = useState(false);
    const [sectorList, setSectorList] = useState<string[]>([]);
    const [isLoadingSectors, setIsLoadingSectors] = useState(false);
    const [showSectorDropdown, setShowSectorDropdown] = useState(false);
    const sectorInputRef = useRef<HTMLInputElement>(null);
    const [sectorConfirm, setSectorConfirm] = useState<{
        isOpen: boolean;
        type: 'ADD' | 'DELETE' | 'DELETE_CASCADE';
        value: string;
    } | null>(null);

    const [businessAreaList, setBusinessAreaList] = useState<string[]>([]);
    const [isLoadingBusinessAreas, setIsLoadingBusinessAreas] = useState(false);
    const [businessAreaConfirm, setBusinessAreaConfirm] = useState<{
        isOpen: boolean;
        type: 'ADD' | 'DELETE';
        value: string;
    } | null>(null);

    useEffect(() => {
        const fetchSectors = async () => {
            setIsLoadingSectors(true);
            try {
                const data = await api.getSectors();
                setSectorList(data || []);
            } catch (err) {
                console.error('Failed to fetch sectors:', err);
                setSectorList([]);
            } finally {
                setIsLoadingSectors(false);
            }
        };
        const fetchBusinessAreas = async () => {
            setIsLoadingBusinessAreas(true);
            try {
                const data = await api.getBusinessAreas();
                setBusinessAreaList(data || []);
            } catch (err) {
                console.error('Failed to fetch business areas:', err);
                setBusinessAreaList([]);
            } finally {
                setIsLoadingBusinessAreas(false);
            }
        };
        fetchSectors();
        fetchBusinessAreas();
    }, [isEditMode, sectorConfirm, businessAreaConfirm]);

    const isoToDisplay = (iso: string) => {
        if (!iso || isNaN(new Date(iso).getTime())) return '';
        return new Date(iso).toLocaleDateString('tr-TR');
    };

    const convertToISO = (dateStr: string) => {
        if (!dateStr || dateStr.length !== 10) return '';
        const [day, month, year] = dateStr.split('.');
        return `${year}-${month}-${day}`;
    };

    const [editFormData, setEditFormData] = useState({
        name: data.company.name,
        sector: data.company.sector,
        businessAreas: data.company.businessAreas || [],
        managerName: data.company.managerName,
        managerPhone: data.company.managerPhone,
        managerEmail: data.company.managerEmail,
        employeeCount: data.company.employeeCount,
        startDate: isoToDisplay(data.lease.startDate),
        endDate: isoToDisplay(data.lease.endDate),
        operatingFee: data.lease.operatingFee || 400, // Default 400
        monthlyRent: data.lease.monthlyRent || 0
    });

    const [documents, setDocuments] = useState<LeaseDocument[]>(() => [...(data.lease.documents || [])]);

    // ...

    const handleSaveCompanyInfo = async () => {
        try {
            if (editFormData.sector) {
                try { await api.addSector(editFormData.sector); } catch { /* sector may already exist */ }
            }
            await api.updateCompany(data.company.id, {
                name: sanitizeInput(editFormData.name),
                sector: sanitizeInput(editFormData.sector),
                managerName: sanitizeInput(editFormData.managerName),
                managerPhone: sanitizeInput(editFormData.managerPhone),
                managerEmail: sanitizeInput(editFormData.managerEmail),
                employeeCount: editFormData.employeeCount
            });

            // Update Lease Dates
            if (editFormData.startDate.length === 10 && editFormData.endDate.length === 10) {
                const startISO = convertToISO(editFormData.startDate);
                const endISO = convertToISO(editFormData.endDate);
                await api.updateLeaseDates(data.company.id, startISO, endISO);
            }

            // Update Lease Financials (Operating Fee)
            await api.updateLease(data.company.id, {
                operatingFee: editFormData.operatingFee,
                monthlyRent: editFormData.monthlyRent
            });

            setIsEditMode(false);
            onUpdate();
            triggerDataChange('company', 'update');
        } catch (err: any) {
            console.error(err);
            alert('Güncelleme sırasında bir hata oluştu: ' + (err.message || ''));
        }
    };
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        fileName: string;
        target: 'CONTRACT' | 'SCORE_FILE_NEW' | 'SCORE_ENTRY';
        index?: number;
        itemId?: string;
    }>({ isOpen: false, fileName: '', target: 'CONTRACT' });

    const formatDateInput = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 2) return numbers;
        if (numbers.length <= 4) return `${numbers.slice(0, 2)}.${numbers.slice(2)}`;
        return `${numbers.slice(0, 2)}.${numbers.slice(2, 4)}.${numbers.slice(4, 8)}`;
    };

    const handleInitiateAddSector = (sectorName: string) => {
        setSectorConfirm({ isOpen: true, type: 'ADD', value: sectorName });
        setShowSectorDropdown(false);
    };

    const handleInitiateDeleteSector = (e: React.MouseEvent, sectorName: string) => {
        e.stopPropagation();
        setSectorConfirm({ isOpen: true, type: 'DELETE', value: sectorName });
        setShowSectorDropdown(false);
    };

    const handleConfirmSectorAction = async (cascade: boolean = false) => {
        if (!sectorConfirm) return;
        try {
            if (sectorConfirm.type === 'ADD') {
                await api.addSector(sectorConfirm.value);
                setEditFormData({ ...editFormData, sector: sectorConfirm.value });
                const sectors = await api.getSectors();
                setSectorList(sectors || []);
                setSectorConfirm(null);
            } else if (sectorConfirm.type === 'DELETE') {
                setSectorConfirm({ ...sectorConfirm, type: 'DELETE_CASCADE' });
            } else if (sectorConfirm.type === 'DELETE_CASCADE') {
                await api.deleteSector(sectorConfirm.value, cascade);
                const sectors = await api.getSectors();
                setSectorList(sectors || []);
                if (editFormData.sector === sectorConfirm.value) {
                    setEditFormData(prev => ({ ...prev, sector: 'Belirtilmedi' }));
                }
                setSectorConfirm(null);
                onUpdate();
            }
        } catch (err: any) {
            console.error('Sector action failed:', err);
            alert('Sektör işlemi başarısız oldu: ' + (err.message || 'Bilinmeyen hata'));
            setSectorConfirm(null);
        }
    };

    const [sectorSearch, setSectorSearch] = useState('');
    const [isSectorEditMode, setIsSectorEditMode] = useState(false);
    const [sectorDeleteStep, setSectorDeleteStep] = useState<1 | 2>(1);
    const [sectorToDelete, setSectorToDelete] = useState<string | null>(null);

    const [businessAreaSearch, setBusinessAreaSearch] = useState('');
    const [isBusinessAreaEditMode, setIsBusinessAreaEditMode] = useState(false);
    const [businessAreaToDelete, setBusinessAreaToDelete] = useState<string | null>(null);

    const filteredSectors = useMemo(() => {
        if (!sectorSearch) return sectorList;
        return sectorList.filter(s => s.toLowerCase().includes(sectorSearch.toLowerCase()));
    }, [sectorList, sectorSearch]);

    const filteredBusinessAreas = useMemo(() => {
        if (!businessAreaSearch) return businessAreaList;
        return businessAreaList.filter(s => s.toLowerCase().includes(businessAreaSearch.toLowerCase()));
    }, [businessAreaList, businessAreaSearch]);

    const handleToggleBusinessArea = (tag: string) => {
        if (isSectorEditMode) return;

        let newAreas = [...(editFormData.businessAreas || [])];
        if (newAreas.includes(tag)) {
            newAreas = newAreas.filter(t => t !== tag);
        } else {
            if (newAreas.length >= 10) {
                alert("En fazla 10 adet iş alanı etiketi ekleyebilirsiniz.");
                return;
            }
            newAreas.push(tag);
        }

        setEditFormData(prev => ({ ...prev, businessAreas: newAreas }));
    };

    const hasBusinessAreaChanges = useMemo(() => {
        const original = data.company.businessAreas || [];
        const current = editFormData.businessAreas || [];
        if (original.length !== current.length) return true;
        const sortedOriginal = [...original].sort();
        const sortedCurrent = [...current].sort();
        return JSON.stringify(sortedOriginal) !== JSON.stringify(sortedCurrent);
    }, [data.company.businessAreas, editFormData.businessAreas]);

    const handleSaveBusinessAreas = async () => {
        try {
            await api.updateCompany(data.company.id, { ...data.company, businessAreas: editFormData.businessAreas });
            onUpdate();
        } catch (err) { console.error(err); }
    };

    const handleAddSector = async () => {
        if (!sectorSearch) return;
        await api.addSector(sectorSearch);
        const sectors = await api.getSectors();
        setSectorList(sectors || []);
        setSectorSearch('');
    };

    const initiateDeleteSector = (sector: string) => {
        setSectorConfirm({ isOpen: true, type: 'DELETE', value: sector });
    };

    const confirmDeleteSector = async (cascade: boolean) => {
        if (!sectorToDelete) return;
        await api.deleteSector(sectorToDelete, cascade);
        const sectors = await api.getSectors();
        setSectorList(sectors || []);
        if (editFormData.sector === sectorToDelete) {
            setEditFormData(prev => ({ ...prev, sector: 'Belirtilmedi' }));
        }
        setSectorToDelete(null);
        setSectorDeleteStep(1);
        onUpdate(); // Update lists
    };

    const handleAddBusinessArea = async () => {
        if (!businessAreaSearch) return;
        await api.addBusinessArea(businessAreaSearch);
        const areas = await api.getBusinessAreas();
        setBusinessAreaList(areas || []);
        setBusinessAreaSearch('');
    };

    const initiateDeleteBusinessArea = (area: string) => {
        setBusinessAreaConfirm({ isOpen: true, type: 'DELETE', value: area });
    };

    const handleConfirmBusinessAreaAction = async () => {
        if (!businessAreaConfirm) return;
        if (businessAreaConfirm.type === 'ADD') {
            await api.addBusinessArea(businessAreaConfirm.value);
            setEditFormData(prev => ({ ...prev, businessAreas: [...(prev.businessAreas || []), businessAreaConfirm.value] }));
            const areas = await api.getBusinessAreas();
            setBusinessAreaList(areas || []);
            setBusinessAreaConfirm(null);
        } else if (businessAreaConfirm.type === 'DELETE') {
            await api.deleteBusinessArea(businessAreaConfirm.value);
            const areas = await api.getBusinessAreas();
            setBusinessAreaList(areas || []);
            setEditFormData(prev => ({ ...prev, businessAreas: prev.businessAreas?.filter(a => a !== businessAreaConfirm.value) }));
            setBusinessAreaConfirm(null);
            onUpdate();
        }
    };

    const handleAddScore = async () => {
        if (!newScore.desc || newScore.points === 0) return;
        const sanitizedNote = sanitizeInput(scoreNote);
        await api.addCompanyScore(data.company.id, {
            type: newScore.categoryId,
            description: newScore.desc,
            points: newScore.points,
            documents: newScoreDocuments,
            note: sanitizedNote
        });
        setNewScore({ categoryId: '', itemId: -1, points: 0, desc: '' });
        setNewScoreDocuments([]);
        setScoreNote('');
        setScoreUploadError(null);
        onUpdate();
    };



    // ... (Upload handlers same as before)
    const handleScoreFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setScoreUploadError(null);
        const securityError = validateFileSecurity(file);
        if (securityError) {
            setScoreUploadError(securityError);
            return;
        }
        if (newScoreDocuments.length >= 2) {
            setScoreUploadError('Maksimum 2 dosya yüklenebilir.');
            return;
        }
        const sanitizedName = sanitizeFilename(file.name);
        if (newScoreDocuments.some(d => d.name === sanitizedName)) {
            setScoreUploadError('Bu dosya zaten listede ekli.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            const fileDataUrl = event.target?.result as string;

            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            const isImage = file.type.includes('image') || ['jpg', 'jpeg', 'png'].includes(ext);
            const isPdf = file.type.includes('pdf') || ext === 'pdf';

            const newDoc = {
                name: sanitizedName,
                url: fileDataUrl,
                type: isImage ? 'IMAGE' : isPdf ? 'PDF' : 'WORD'
            };
            setNewScoreDocuments(prev => [...prev, newDoc]);
        };
        reader.readAsDataURL(file);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploadError(null);
        const securityError = validateFileSecurity(file);
        if (securityError) {
            setUploadError(securityError);
            return;
        }
        if (documents.length >= 4) {
            setUploadError('Maksimum 4 sözleşme dosyası yüklenebilir.');
            return;
        }
        const sanitizedName = sanitizeFilename(file.name);
        if (documents.some(doc => doc.name === sanitizedName)) {
            setUploadError('Bu isimde bir dosya zaten yüklü.');
            return;
        }
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            const fileDataUrl = event.target?.result as string;

            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            const isImage = file.type.includes('image') || ['jpg', 'jpeg', 'png'].includes(ext);
            const isPdf = file.type.includes('pdf') || ext === 'pdf';

            const newDoc = {
                name: sanitizedName,
                url: fileDataUrl,
                type: isImage ? 'IMAGE' : isPdf ? 'PDF' : 'WORD'
            };
            if (data.lease.id === 'PENDING') {
                await api.addDocument(data.company.id, newDoc, true);
            } else {
                await api.addDocument(data.lease.id, newDoc, false);
            }
            setDocuments(prev => [...prev, newDoc]);
            setIsUploading(false);
        };
        reader.readAsDataURL(file);
    };

    const handleDownload = async (doc: { url: string, name: string }) => {
        try {
            if (doc.url.startsWith('data:')) {
                // Convert data URL to Blob to preserve original filename on all browsers
                const fetchRes = await fetch(doc.url);
                const blob = await fetchRes.blob();
                const objectUrl = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = objectUrl;
                link.download = doc.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
            } else {
                const link = document.createElement('a');
                link.href = doc.url;
                link.download = doc.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error('Download failed:', error);
            alert('Dosya indirilirken bir hata oluştu.');
        }
    };

    const handleDeleteContractClick = (docName: string) => {
        setDeleteModal({
            isOpen: true,
            fileName: docName,
            target: 'CONTRACT'
        });
    };

    const handleDeleteScoreEntryClick = (scoreId: string, description: string) => {
        setDeleteModal({
            isOpen: true,
            fileName: description,
            target: 'SCORE_ENTRY',
            itemId: scoreId
        });
    };

    const handleDeleteNewScoreFileClick = (docName: string, index: number) => {
        setDeleteModal({
            isOpen: true,
            fileName: docName,
            target: 'SCORE_FILE_NEW',
            index: index
        });
    };

    const confirmDelete = async () => {
        if (deleteModal.target === 'CONTRACT') {
            const targetId = data.lease.id === 'PENDING' ? data.company.id : data.lease.id;
            const isPending = data.lease.id === 'PENDING';
            try {
                await api.deleteDocument(targetId, deleteModal.fileName, isPending);
                setDocuments(prev => prev.filter(d => d.name !== deleteModal.fileName));
                setDocuments(prev => prev.filter(d => d.name !== deleteModal.fileName));
                onUpdate();
            } catch (error) {
                console.error("Silme hatası:", error);
                alert("Belge silinirken bir hata oluştu.");
            }
        } else if (deleteModal.target === 'SCORE_FILE_NEW') {
            if (deleteModal.index !== undefined) {
                setNewScoreDocuments(prev => prev.filter((_, idx) => idx !== deleteModal.index));
            }
        } else if (deleteModal.target === 'SCORE_ENTRY') {
            if (deleteModal.itemId) {
                try {
                    await api.deleteCompanyScore(data.company.id, deleteModal.itemId);
                    onUpdate();
                } catch (error) {
                    console.error("Silme hatası:", error);
                    alert("Kayıt silinirken bir hata oluştu.");
                }
            }
        }
        setDeleteModal({ ...deleteModal, isOpen: false });
    };

    const isPending = data.lease.id === 'PENDING';
    const displaySectors = useMemo(() => {
        if (!editFormData.sector) return sectorList;
        return sectorList.filter(s => s.toLowerCase().includes(editFormData.sector.toLowerCase()));
    }, [sectorList, editFormData.sector]);
    const isExactMatch = useMemo(() => {
        return sectorList.some(s => s.toLowerCase() === editFormData.sector.trim().toLowerCase());
    }, [sectorList, editFormData.sector]);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
                <div className="px-5 py-4 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 leading-tight">{data.company.name}</h2>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{data.company.sector}</span>
                                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                    <div className="flex items-center gap-1 text-amber-600">
                                        <Award className="w-3 h-3" />
                                        <span className="text-xs font-black">{data.company.score} Puan</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"><X className="w-5 h-5" /></button>
                    </div>

                    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                        {['INFO', 'CONTRACTS', 'SCORE', 'WORK_AREAS'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap px-2 ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {tab === 'INFO' ? 'Firma Bilgileri' : tab === 'CONTRACTS' ? 'Sözleşmeler' : tab === 'SCORE' ? 'Karne & Puanlar' : 'Firma İş Alanı'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
                    {activeTab === 'WORK_AREAS' && (
                        <div className="space-y-6">
                            {/* New Section: Assigned Business Areas */}
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase">Firmanın Sahip Olduğu İş Etiketleri</h4>
                                    {hasBusinessAreaChanges && (
                                        <button
                                            onClick={handleSaveBusinessAreas}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm animate-pulse"
                                        >
                                            <Save className="w-3.5 h-3.5" />
                                            Değişiklikleri Kaydet
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 min-h-[60px]">
                                    {editFormData.businessAreas && editFormData.businessAreas.length > 0 ? (
                                        editFormData.businessAreas.map((area, idx) => (
                                            <div key={idx} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm group">
                                                <span>{area}</span>
                                                <button
                                                    onClick={() => handleToggleBusinessArea(area)}
                                                    className="ml-1 p-0.5 hover:bg-white/20 rounded-full transition-colors"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex items-center justify-center w-full text-gray-400 text-xs italic">
                                            Henüz bir iş alanı etiketi eklenmemiş. Aşağıdaki listeden seçebilirsiniz.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
                                <div className="p-4 bg-indigo-50 border-b border-blue-100 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600">
                                            <Briefcase className="w-4 h-4" />
                                        </div>
                                        <span className="font-bold text-gray-800 text-sm">İş Alanı Yönetimi</span>
                                    </div>
                                    <button
                                        onClick={() => setIsBusinessAreaEditMode(!isBusinessAreaEditMode)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${isBusinessAreaEditMode ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        <Settings className="w-3.5 h-3.5" />
                                        {isBusinessAreaEditMode ? 'Düzenlemeyi Bitir' : 'Etiketleri Düzenle'}
                                    </button>
                                </div>
                                <div className="p-4 bg-white/50 backdrop-blur-sm">
                                    <div className="relative mb-4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="İş alanı ara veya yeni ekle..."
                                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-indigo-100 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm placeholder-gray-400"
                                            value={businessAreaSearch}
                                            onChange={(e) => setBusinessAreaSearch(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddBusinessArea()}
                                        />
                                        {businessAreaSearch && (
                                            <button
                                                onClick={handleAddBusinessArea}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm flex items-center gap-1"
                                            >
                                                <Plus className="w-3 h-3" /> Ekle
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-3 max-h-[300px] overflow-y-auto p-1 pr-2 custom-scrollbar content-start">
                                        {filteredBusinessAreas.map((area) => {
                                            const isSelected = editFormData.businessAreas?.includes(area);
                                            return (
                                                <motion.button
                                                    key={area}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    onClick={(e: React.MouseEvent) => isBusinessAreaEditMode ? initiateDeleteBusinessArea(area) : handleToggleBusinessArea(area)}
                                                    className={`
                                                        relative px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 group text-left max-w-full shadow-sm
                                                        ${isBusinessAreaEditMode
                                                            ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 cursor-pointer'
                                                            : isSelected
                                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 ring-2 ring-emerald-500 ring-offset-1 z-10'
                                                                : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-md'
                                                        }
                                                    `}
                                                >
                                                    <div className="flex-1 truncate">{area}</div>
                                                    {isBusinessAreaEditMode ? (
                                                        <Trash2 className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                                                    ) : isSelected ? (
                                                        <Check className="w-4 h-4" />
                                                    ) : (
                                                        <Plus className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                                                    )}
                                                </motion.button>
                                            );
                                        })}{filteredBusinessAreas.length === 0 && (
                                            <div className="w-full text-center py-4">
                                                <p className="text-gray-400 text-xs italic">Aramanızla eşleşen iş alanı bulunamadı.</p>
                                                {businessAreaSearch && (
                                                    <button onClick={handleAddBusinessArea} className="mt-2 text-indigo-600 text-xs font-bold hover:underline">
                                                        "{businessAreaSearch}" ekle
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'INFO' ? (
                        <div className="flex flex-col gap-4 h-full">
                            <div className={`p-4 rounded-xl border transition-all duration-300 ${isEditMode ? 'bg-white border-indigo-200 ring-2 ring-indigo-50 shadow-sm' : 'bg-slate-50 border-slate-100'}`}>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Firma Adı</label>
                                {isEditMode ? (
                                    <input
                                        type="text"
                                        className="w-full bg-transparent border-b border-indigo-100 focus:border-indigo-500 pb-1 text-base font-black text-gray-900 outline-none transition-all placeholder-gray-300"
                                        value={editFormData.name}
                                        onChange={e => setEditFormData({ ...editFormData, name: sanitizeInput(e.target.value) })}
                                        placeholder="Firma Adı Giriniz"
                                    />
                                ) : (
                                    <div className="text-base font-black text-gray-900 truncate">
                                        {data.company.name}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                                <div className="space-y-4">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-full">
                                        <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 mb-3">
                                            <LayoutGrid className="w-3 h-3" /> Ofis & Konum
                                        </h4>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                            <div><label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Kampüs</label><div className="font-bold text-gray-900 text-xs truncate">{isUnallocated ? 'YOK' : data.campus.name}</div></div>
                                            <div><label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Blok</label><div className="font-bold text-gray-900 text-xs truncate">{isUnallocated ? 'YOK' : data.block.name}</div></div>
                                            <div><label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Kat</label><div className="font-bold text-gray-900 text-xs">{isUnallocated ? 'YOK' : `${data.unit.floor}. Kat`}</div></div>

                                            <div>
                                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Sektör</label>
                                                {isEditMode ? (
                                                    <div className="relative group">
                                                        <input
                                                            ref={sectorInputRef}
                                                            type="text"
                                                            className="w-full p-1 bg-indigo-50 border border-indigo-200 rounded text-xs font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 transition-all pr-6 placeholder:text-indigo-300"
                                                            value={editFormData.sector}
                                                            onChange={e => setEditFormData({ ...editFormData, sector: e.target.value })}
                                                            onFocus={() => setShowSectorDropdown(true)}
                                                            onBlur={() => setTimeout(() => setShowSectorDropdown(false), 200)}
                                                            placeholder="Sektör Giriniz veya Seçiniz"
                                                        />
                                                        <button
                                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-indigo-500 p-1 hover:bg-indigo-100 rounded"
                                                            onClick={() => {
                                                                setShowSectorDropdown(!showSectorDropdown);
                                                                if (!showSectorDropdown) sectorInputRef.current?.focus();
                                                            }}
                                                            tabIndex={-1}
                                                        >
                                                            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showSectorDropdown ? 'rotate-180' : ''}`} />
                                                        </button>

                                                        <AnimatePresence>
                                                            {showSectorDropdown && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 5 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    exit={{ opacity: 0, y: 5 }}
                                                                    className="absolute top-full left-0 min-w-full w-max max-w-[280px] sm:max-w-[450px] mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 flex flex-col"
                                                                >
                                                                    {editFormData.sector && !isExactMatch ? (
                                                                        <div
                                                                            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 cursor-pointer text-xs font-bold text-indigo-700 flex items-center gap-2 border-b border-indigo-100 sticky top-0"
                                                                            onMouseDown={(e) => {
                                                                                e.preventDefault();
                                                                                handleInitiateAddSector(editFormData.sector);
                                                                            }}
                                                                        >
                                                                            <PlusCircle className="w-3.5 h-3.5" />
                                                                            "<b>{editFormData.sector}</b>" Sektörünü Ekle
                                                                        </div>
                                                                    ) : (
                                                                        <div
                                                                            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 cursor-pointer text-xs font-bold text-indigo-700 flex items-center gap-2 border-b border-indigo-100 sticky top-0"
                                                                            onMouseDown={(e) => {
                                                                                e.preventDefault();
                                                                                setEditFormData({ ...editFormData, sector: '' });
                                                                                setTimeout(() => sectorInputRef.current?.focus(), 10);
                                                                            }}
                                                                        >
                                                                            <PlusCircle className="w-3.5 h-3.5" />
                                                                            Yeni Sektör Ekle
                                                                        </div>
                                                                    )}

                                                                    {displaySectors.length > 0 ? (
                                                                        displaySectors.map(s => (
                                                                            <div
                                                                                key={s}
                                                                                className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-xs font-bold text-gray-700 flex items-center justify-between border-b border-gray-50 last:border-0 group/item"
                                                                                onMouseDown={(e) => {
                                                                                    e.preventDefault();
                                                                                    setEditFormData({ ...editFormData, sector: s });
                                                                                    setShowSectorDropdown(false);
                                                                                }}
                                                                            >
                                                                                <span className="whitespace-normal break-words leading-tight pr-2">{s}</span>
                                                                                <button
                                                                                    onClick={(e) => handleInitiateDeleteSector(e, s)}
                                                                                    className="text-gray-300 hover:text-rose-500 p-1 rounded hover:bg-rose-50 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0"
                                                                                    title="Listeden Sil"
                                                                                >
                                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        <div className="px-3 py-4 text-center text-[10px] text-gray-400 font-medium">
                                                                            Sonuç bulunamadı.<br />Yukarıdaki butona basarak ekleyebilirsiniz.
                                                                        </div>
                                                                    )}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                ) : (
                                                    <div className="font-bold text-gray-900 text-xs truncate" title={editFormData.sector}>{editFormData.sector}</div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Sözleşme Başlangıç</label>
                                                {isEditMode ? (
                                                    <div className="relative">
                                                        <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 pointer-events-none" />
                                                        <input
                                                            type="text"
                                                            placeholder="GG.AA.YYYY"
                                                            maxLength={10}
                                                            className="w-full pl-6 p-1 bg-indigo-50 border border-indigo-200 rounded text-xs font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 transition-all"
                                                            value={editFormData.startDate}
                                                            onChange={e => setEditFormData({ ...editFormData, startDate: formatDateInput(e.target.value) })}
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
                                                            className="w-full pl-6 p-1 bg-indigo-50 border border-indigo-200 rounded text-xs font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 transition-all"
                                                            value={editFormData.endDate}
                                                            onChange={e => setEditFormData({ ...editFormData, endDate: formatDateInput(e.target.value) })}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="font-bold text-gray-900 text-xs truncate">
                                                        {editFormData.endDate || '-'}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Financial Details */}
                                            {(() => {
                                                const area = data.unit.areaSqM;
                                                // const isUnallocated = data.lease.id === 'PENDING' || !data.lease.unitId; // Inherited from component scope

                                                let displayRentPerSqm = 0;
                                                let displayMonthlyRent: string | number = editFormData.monthlyRent;

                                                if (isUnallocated) {
                                                    // For both PENDING and DETACHED (unallocated) leases:
                                                    // Prioritize preserved Unit Price if available
                                                    if (data.lease.unitPricePerSqm && data.lease.unitPricePerSqm > 0) {
                                                        displayRentPerSqm = data.lease.unitPricePerSqm;
                                                    }
                                                    // Fallback to template if preserved price is not available
                                                    else if (data.company.contractTemplate) {
                                                        displayRentPerSqm = data.company.contractTemplate.rentPerSqM;
                                                    } else {
                                                        displayRentPerSqm = 0;
                                                    }
                                                    displayMonthlyRent = '-';
                                                } else {
                                                    displayRentPerSqm = area > 0 ? (editFormData.monthlyRent / area) : 0;
                                                }

                                                return (
                                                    <>
                                                        <div>
                                                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">m² Birim Kira</label>
                                                            {isEditMode ? (
                                                                <div className="relative">
                                                                    <input
                                                                        type="number"
                                                                        className="w-full pl-2 p-1.5 bg-indigo-50 border border-indigo-200 rounded text-xs font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                        value={displayRentPerSqm === 0 ? '' : displayRentPerSqm}
                                                                        placeholder="ÜCRETSİZ"
                                                                        onChange={(e) => {
                                                                            if (isUnallocated) return;
                                                                            let val = parseFloat(e.target.value);
                                                                            if (val < 0) val = 0;
                                                                            if (isNaN(val)) val = 0;
                                                                            const newMonthlyRent = val * area;
                                                                            setEditFormData(prev => ({ ...prev, monthlyRent: newMonthlyRent }));
                                                                        }}
                                                                        readOnly={isUnallocated}
                                                                    />
                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">TL</span>
                                                                </div>
                                                            ) : (
                                                                <div className="font-bold text-gray-900 text-xs truncate">
                                                                    {displayRentPerSqm < 0.01 ? 'ÜCRETSİZ' : `${formatCurrency(displayRentPerSqm, isPresentationMode)} TL`}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Aylık Kira</label>
                                                            <div className="font-bold text-gray-900 text-xs truncate">
                                                                {isUnallocated ? '-' : (Number(displayMonthlyRent) < 0.01) ? 'ÜCRETSİZ' : `${formatCurrency(displayMonthlyRent as number, isPresentationMode)} TL`}
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}

                                            <div>
                                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">İşletme Ücreti</label>
                                                {isEditMode ? (
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            className="w-full pl-2 p-1.5 bg-indigo-50 border border-indigo-200 rounded text-xs font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            value={editFormData.operatingFee === 0 ? '' : editFormData.operatingFee}
                                                            placeholder="ÜCRETSİZ"
                                                            onChange={e => {
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
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">TL</span>
                                                    </div>
                                                ) : (
                                                    <div className="font-bold text-gray-900 text-xs truncate">
                                                        {isUnallocated ? '-' : editFormData.operatingFee === 0 ? 'ÜCRETSİZ' : `${formatCurrency(editFormData.operatingFee, isPresentationMode)} TL / Ay`}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="col-span-2 pt-2 grid grid-cols-2 gap-3">
                                                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                    <label className="block text-[9px] font-bold text-indigo-500 uppercase mb-1">Alan (m²)</label>
                                                    <div className="font-black text-gray-900 text-sm">{isPending ? '-' : data.unit.areaSqM} m²</div>
                                                </div>
                                                <div className={`p-2 rounded-lg border transition-colors ${isEditMode ? 'bg-white border-indigo-200 ring-2 ring-indigo-50' : 'bg-slate-50 border-slate-100'}`}>
                                                    <label className="block text-[9px] font-bold text-indigo-500 uppercase mb-1">Çalışan</label>
                                                    {isEditMode ? (
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-transparent outline-none text-sm font-black text-gray-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-gray-400/50"
                                                                value={editFormData.employeeCount === 0 ? '' : editFormData.employeeCount}
                                                                placeholder="Belirtilmedi"
                                                                onChange={e => {
                                                                    if (e.target.value === '') {
                                                                        setEditFormData({ ...editFormData, employeeCount: 0 });
                                                                        return;
                                                                    }
                                                                    let val = parseInt(e.target.value);
                                                                    if (val < 0) val = 0;
                                                                    if (isNaN(val)) val = 0;
                                                                    setEditFormData({ ...editFormData, employeeCount: val });
                                                                }}
                                                            />
                                                            <span className="text-[10px] font-bold text-gray-400">Kişi</span>
                                                        </div>
                                                    ) : (
                                                        <div className="font-black text-gray-900 text-sm">
                                                            {editFormData.employeeCount > 0 ? `${editFormData.employeeCount} Kişi` : 'Belirtilmedi'}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-full">
                                        <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 mb-3"><User className="w-3 h-3" /> İletişim</h4>
                                        <div className="space-y-3">
                                            <div className="group">
                                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Yönetici</label>
                                                <div className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${isEditMode ? 'bg-white border-indigo-200 ring-2 ring-indigo-50' : 'bg-slate-50 border-slate-100'}`}>
                                                    <User className={`w-3.5 h-3.5 ${isEditMode ? 'text-indigo-500' : 'text-slate-400'}`} />
                                                    {isEditMode ? (
                                                        <input
                                                            type="text"
                                                            className="w-full bg-transparent outline-none text-xs font-bold text-gray-900 placeholder-gray-300"
                                                            value={editFormData.managerName}
                                                            onChange={e => setEditFormData({ ...editFormData, managerName: sanitizeInput(e.target.value) })}
                                                            placeholder="Ad Soyad"
                                                        />
                                                    ) : (
                                                        <span className="font-bold text-gray-900 text-xs truncate">{editFormData.managerName}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="group">
                                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Telefon</label>
                                                <div className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${isEditMode ? 'bg-white border-indigo-200 ring-2 ring-indigo-50' : 'bg-slate-50 border-slate-100'}`}>
                                                    <Phone className={`w-3.5 h-3.5 ${isEditMode ? 'text-indigo-500' : 'text-slate-400'}`} />
                                                    {isEditMode ? (
                                                        <input
                                                            type="tel"
                                                            className="w-full bg-transparent outline-none text-xs font-bold text-gray-900 placeholder-gray-300"
                                                            value={editFormData.managerPhone}
                                                            onChange={e => setEditFormData({ ...editFormData, managerPhone: sanitizeInput(e.target.value) })}
                                                            placeholder="05XX..."
                                                        />
                                                    ) : (
                                                        <span className="font-bold text-gray-900 text-xs truncate">{editFormData.managerPhone}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="group">
                                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">E-Posta</label>
                                                <div className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${isEditMode ? 'bg-white border-indigo-200 ring-2 ring-indigo-50' : 'bg-slate-50 border-slate-100'}`}>
                                                    <Mail className={`w-3.5 h-3.5 ${isEditMode ? 'text-indigo-500' : 'text-slate-400'}`} />
                                                    {isEditMode ? (
                                                        <input
                                                            type="email"
                                                            className="w-full bg-transparent outline-none text-xs font-bold text-gray-900 placeholder-gray-300"
                                                            value={editFormData.managerEmail}
                                                            onChange={e => setEditFormData({ ...editFormData, managerEmail: sanitizeInput(e.target.value) })}
                                                            placeholder="mail@firma.com"
                                                        />
                                                    ) : (
                                                        <span className="font-bold text-gray-900 text-xs truncate">{editFormData.managerEmail}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'CONTRACTS' ? (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                                    Yeni Belge Yükle
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3 text-emerald-500" /> Güvenli Mod
                                    </span>
                                    {documents.length >= 4 && <span className="text-rose-500 ml-auto">(Sınır Doldu)</span>}
                                </h4>
                                <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors relative ${isUploading ? 'bg-gray-50 border-gray-300' : documents.length >= 4 ? 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed' : 'border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300'}`}>
                                    {isUploading ? (
                                        <div className="flex flex-col items-center">
                                            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-2"></div>
                                            <span className="text-xs font-bold text-indigo-600">Güvenlik Taraması & Yükleme...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                type="file"
                                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                className={`absolute inset-0 w-full h-full opacity-0 ${documents.length >= 4 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                                onChange={handleFileUpload}
                                                disabled={documents.length >= 4}
                                            />
                                            <CloudUpload className={`w-8 h-8 mx-auto mb-2 ${documents.length >= 4 ? 'text-gray-400' : 'text-indigo-400'}`} />
                                            <p className={`text-sm font-bold ${documents.length >= 4 ? 'text-gray-500' : 'text-indigo-900'}`}>
                                                {documents.length >= 4 ? 'Maksimum 4 dosya yüklenebilir' : 'Dosyayı buraya sürükleyin veya seçin'}
                                            </p>
                                            <p className="text-[10px] text-gray-400 mt-1 font-medium">PDF, Word (.doc, .docx) veya Görsel (.jpg, .png) - Maks. 5MB</p>
                                        </>
                                    )}
                                </div>
                                {uploadError && (
                                    <div className="flex items-center gap-2 text-rose-600 bg-rose-50 p-2 rounded-lg text-xs font-bold">
                                        <AlertCircle className="w-4 h-4" /> {uploadError}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-gray-400 uppercase">Mevcut Belgeler ({documents.length}/4)</h4>
                                <div className="space-y-2">
                                    {documents.length > 0 ? documents.map((doc, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200 shadow-sm hover:border-indigo-200 transition-colors group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`p-2 rounded-lg shrink-0 ${doc.type === 'PDF' ? 'bg-rose-50 text-rose-600' : doc.type === 'IMAGE' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    {doc.type === 'PDF' ? <FileText className="w-4 h-4" /> : doc.type === 'IMAGE' ? <Image className="w-4 h-4" /> : <File className="w-4 h-4" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold text-gray-900 truncate">{doc.name}</div>
                                                    <div className="text-[9px] font-bold text-gray-400 uppercase">{doc.type === 'IMAGE' ? 'GÖRSEL' : doc.type} Dosyası • {new Date().toLocaleDateString('tr-TR')}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="İndir"
                                                    onClick={() => handleDownload(doc)}
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                                <button
                                                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                    title="Sil"
                                                    onClick={() => handleDeleteContractClick(doc.name)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="text-center py-6 text-gray-400 text-xs font-medium bg-slate-50 rounded-xl border border-slate-100">
                                            Henüz yüklenmiş sözleşme bulunmuyor.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}
                    {activeTab === 'SCORE' && (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-gray-400 uppercase">Puan Geçmişi</h4>
                                {data.company.scoreEntries.length > 0 ? (
                                    data.company.scoreEntries.map(entry => (
                                        <div key={entry.id} className="flex justify-between items-start p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
                                            <div className="flex flex-col flex-1 min-w-0 mr-3">
                                                <div className="text-xs font-bold text-gray-900">{entry.description}</div>
                                                <div className="text-[10px] text-gray-500 mt-0.5">{new Date(entry.date).toLocaleDateString('tr-TR')}</div>
                                                {entry.note && (
                                                    <div className="mt-2 text-[10px] text-gray-500 italic bg-slate-50 p-2 rounded border border-slate-100">
                                                        "{entry.note}"
                                                    </div>
                                                )}
                                                {entry.documents && entry.documents.length > 0 && (
                                                    <div className="flex items-center gap-2 mt-2">
                                                        {entry.documents.map((d, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => handleDownload(d)}
                                                                className="flex items-center gap-1 text-[9px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 px-2 py-1 rounded border border-slate-200 transition-colors"
                                                            >
                                                                <Download className="w-3 h-3" /> {d.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded shrink-0">+ {entry.points}</span>
                                                <button
                                                    onClick={() => handleDeleteScoreEntryClick(entry.id, entry.description)}
                                                    className="p-1 text-gray-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Kaydı Sil"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-gray-400 text-xs font-medium">Henüz puan girişi yapılmamış.</div>
                                )}
                            </div>

                            <div className="pt-6 border-t border-gray-200">
                                <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/60">
                                    <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        Yeni Puan Girişi
                                    </h4>
                                    <div className="space-y-3">
                                        {activeDropdown && (
                                            <div className="fixed inset-0 z-40" onClick={() => setActiveDropdown(null)} />
                                        )}

                                        <div className="space-y-3 relative z-50">
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveDropdown(activeDropdown === 'category' ? null : 'category')}
                                                    className={`w-full p-2.5 bg-white border rounded-xl text-xs font-bold text-gray-700 flex items-center justify-between transition-all ${activeDropdown === 'category' ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-gray-200 hover:border-indigo-300'}`}
                                                >
                                                    <span className="truncate mr-2">
                                                        {SCORE_CATEGORIES.find(c => c.id === newScore.categoryId)?.label || 'Kategori Seçin...'}
                                                    </span>
                                                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activeDropdown === 'category' ? 'rotate-180' : ''}`} />
                                                </button>

                                                {activeDropdown === 'category' && (
                                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-[60] max-h-60 overflow-y-auto py-1">
                                                        {SCORE_CATEGORIES.map(cat => (
                                                            <div
                                                                key={cat.id}
                                                                onClick={() => {
                                                                    setNewScore({ ...newScore, categoryId: cat.id, itemId: -1, points: 0, desc: '' });
                                                                    setActiveDropdown(null);
                                                                }}
                                                                className={`px-3 py-2.5 text-xs font-medium cursor-pointer transition-colors flex items-center gap-2 ${newScore.categoryId === cat.id ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'}`}
                                                            >
                                                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${newScore.categoryId === cat.id ? 'bg-indigo-500' : 'bg-gray-200'}`} />
                                                                {cat.label}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {newScore.categoryId && (
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveDropdown(activeDropdown === 'item' ? null : 'item')}
                                                        className={`w-full p-2.5 bg-white border rounded-xl text-xs font-bold text-gray-700 flex items-center justify-between transition-all ${activeDropdown === 'item' ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-gray-200 hover:border-indigo-300'}`}
                                                    >
                                                        <span className="truncate mr-2">
                                                            {(() => {
                                                                const cat = SCORE_CATEGORIES.find(c => c.id === newScore.categoryId);
                                                                if (cat && newScore.itemId !== -1 && cat.items[newScore.itemId]) {
                                                                    const item = cat.items[newScore.itemId];
                                                                    return `${item.label} (${item.points} Puan)`;
                                                                }
                                                                return 'Faaliyet Seçin...';
                                                            })()}
                                                        </span>
                                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activeDropdown === 'item' ? 'rotate-180' : ''}`} />
                                                    </button>

                                                    {activeDropdown === 'item' && (
                                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-[60] max-h-60 overflow-y-auto py-1">
                                                            {SCORE_CATEGORIES.find(c => c.id === newScore.categoryId)?.items.map((item, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    onClick={() => {
                                                                        setNewScore({ ...newScore, itemId: idx, points: item.points, desc: item.label });
                                                                        setActiveDropdown(null);
                                                                    }}
                                                                    className={`px-3 py-2.5 text-xs font-medium cursor-pointer transition-colors flex items-center gap-2 ${newScore.itemId === idx ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'}`}
                                                                >
                                                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${newScore.itemId === idx ? 'bg-indigo-500' : 'bg-gray-200'}`} />
                                                                    <div className="flex-1 truncate">
                                                                        {item.label} <span className="text-gray-400 font-normal">({item.points} Puan)</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {newScore.itemId !== -1 && (
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                                    <MessageSquare className="w-3 h-3" /> Ek Açıklama / Not
                                                </label>
                                                <textarea
                                                    className="w-full p-2 border border-gray-200 rounded-lg text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none text-gray-900"
                                                    placeholder="Opsiyonel açıklama giriniz (Max 300 karakter)..."
                                                    rows={3}
                                                    value={scoreNote}
                                                    onChange={(e) => setScoreNote(sanitizeInput(e.target.value).slice(0, 300))}
                                                />
                                                <div className="text-right text-[9px] font-bold text-slate-400">
                                                    {scoreNote.length}/300
                                                </div>
                                            </div>
                                        )}

                                        {newScore.itemId !== -1 && (
                                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg border-dashed">
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                                        <ShieldCheck className="w-3 h-3 text-emerald-500" /> Kanıt Dosyası (Max 2, 5MB)
                                                    </label>
                                                    <span className="text-[10px] font-bold text-slate-400">{newScoreDocuments.length}/2</span>
                                                </div>

                                                <div className="flex gap-2 items-center">
                                                    <input
                                                        type="file"
                                                        id="score-upload"
                                                        className="hidden"
                                                        accept=".pdf,.doc,.docx"
                                                        onChange={handleScoreFileUpload}
                                                        disabled={newScoreDocuments.length >= 2}
                                                    />
                                                    <label
                                                        htmlFor="score-upload"
                                                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded border cursor-pointer transition-colors text-xs font-bold ${newScoreDocuments.length >= 2 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50'}`}
                                                    >
                                                        <Upload className="w-3.5 h-3.5" />
                                                        {newScoreDocuments.length >= 2 ? 'Limit Doldu' : 'Dosya Seç'}
                                                    </label>
                                                </div>

                                                {scoreUploadError && <div className="text-[10px] text-rose-600 font-bold mt-2">{scoreUploadError}</div>}

                                                {newScoreDocuments.length > 0 && (
                                                    <div className="mt-3 space-y-1">
                                                        {newScoreDocuments.map((doc, i) => (
                                                            <div key={i} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                                                                <div className="flex items-center gap-2 overflow-hidden">
                                                                    <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                                    <span className="text-[10px] font-bold text-gray-700 truncate">{doc.name}</span>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleDeleteNewScoreFileClick(doc.name, i)}
                                                                    className="text-gray-400 hover:text-rose-500"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <Button
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all py-2.5 h-auto text-sm font-bold active:scale-[0.98]"
                                            disabled={!newScore.desc}
                                            onClick={handleAddScore}
                                        >
                                            Puan Ekle
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 shrink-0">
                    {activeTab === 'INFO' ? (
                        isEditMode ? (
                            <>
                                <Button variant="ghost" onClick={() => setIsEditMode(false)} className="text-xs font-bold text-gray-500 h-9">İptal</Button>
                                <Button onClick={handleSaveCompanyInfo} className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 h-9">
                                    <Save className="w-3.5 h-3.5 mr-2" /> Değişiklikleri Kaydet
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" onClick={onClose} className="text-xs font-bold text-gray-500 h-9">Kapat</Button>
                                <Button onClick={() => setIsEditMode(true)} className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 h-9">
                                    <Edit3 className="w-3.5 h-3.5 mr-2" /> Düzenle
                                </Button>
                            </>
                        )
                    ) : (
                        <Button variant="ghost" onClick={onClose} className="text-xs font-bold text-gray-500 h-9">Kapat</Button>
                    )}
                </div>

                {/* Delete/Sector Modals (kept same) */}
                {
                    deleteModal.isOpen && (
                        <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm border border-gray-200 scale-100 animate-in zoom-in-95">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4 border border-rose-100">
                                        <Trash2 className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                                        {deleteModal.target === 'SCORE_ENTRY' ? 'Kayıt Silinecek' : 'Dosya Silinecek'}
                                    </h3>
                                    <p className="text-xs font-medium text-gray-500 mb-6">
                                        <span className="font-bold text-gray-800">"{deleteModal.fileName}"</span>
                                        {deleteModal.target === 'SCORE_ENTRY'
                                            ? ' puan kaydını silmek istediğinize emin misiniz? Bu işlem toplam puanı etkiler.'
                                            : ' dosyasını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.'}
                                    </p>
                                    <div className="flex gap-3 w-full">
                                        <Button variant="ghost" onClick={() => setDeleteModal({ ...deleteModal, isOpen: false })} className="flex-1 font-bold text-gray-600">Vazgeç</Button>
                                        <Button onClick={confirmDelete} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold">Evet, Sil</Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }
                {sectorConfirm && sectorConfirm.isOpen && (
                    <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm border border-gray-200 scale-100 animate-in zoom-in-95">
                            <div className="flex flex-col items-center text-center">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 border ${sectorConfirm.type === 'ADD' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                    {sectorConfirm.type === 'ADD' ? <Plus className="w-6 h-6" /> : <Trash2 className="w-6 h-6" />}
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">
                                    {sectorConfirm.type === 'ADD' ? 'Sektör Eklensin mi?' : 'Sektör Silinsin mi?'}
                                </h3>
                                <p className="text-xs font-medium text-gray-500 mb-6 px-2">
                                    <span className="font-black text-gray-800">"{sectorConfirm.value}"</span>
                                    {sectorConfirm.type === 'ADD'
                                        ? ' sektörünü listeye eklemek istediğinize emin misiniz?'
                                        : sectorConfirm.type === 'DELETE'
                                            ? ' sektörünü listeden silmek istediğinize emin misiniz?'
                                            : ' sektörünü sistem kayıtlı TÜM firmalardan da kaldırmak ister misiniz?'}
                                </p>
                                <div className="flex gap-3 w-full">
                                    {sectorConfirm.type === 'DELETE_CASCADE' ? (
                                        <>
                                            <Button onClick={() => handleConfirmSectorAction(false)} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] h-auto py-2 leading-tight">Sadece Listeden Sil<br />(Firmalarda Kalsın)</Button>
                                            <Button onClick={() => handleConfirmSectorAction(true)} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] h-auto py-2 leading-tight">Tüm Firmalardan Kaldır<br />(Cascade Silme)</Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button variant="ghost" onClick={() => setSectorConfirm(null)} className="flex-1 font-bold text-gray-600">Vazgeç</Button>
                                            <Button onClick={() => handleConfirmSectorAction(false)} className={`flex-1 font-bold text-white ${sectorConfirm.type === 'ADD' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                                                {sectorConfirm.type === 'ADD' ? 'Evet, Ekle' : 'Evet, Sil'}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {businessAreaConfirm && businessAreaConfirm.isOpen && (
                    <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm border border-gray-200 scale-100 animate-in zoom-in-95">
                            <div className="flex flex-col items-center text-center">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 border ${businessAreaConfirm.type === 'ADD' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                    {businessAreaConfirm.type === 'ADD' ? <Plus className="w-6 h-6" /> : <Trash2 className="w-6 h-6" />}
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">
                                    {businessAreaConfirm.type === 'ADD' ? 'İş Alanı Eklensin mi?' : 'İş Alanı Silinsin mi?'}
                                </h3>
                                <p className="text-xs font-medium text-gray-500 mb-6 px-2">
                                    <span className="font-black text-gray-800">"{businessAreaConfirm.value}"</span>
                                    {businessAreaConfirm.type === 'ADD'
                                        ? ' iş alanını listeye eklemek istediğinize emin misiniz?'
                                        : ' iş alanını sistemden silmek istediğinize emin misiniz? (Firmalardan silinmeyecektir)'}
                                </p>
                                <div className="flex gap-3 w-full">
                                    <Button variant="ghost" onClick={() => setBusinessAreaConfirm(null)} className="flex-1 font-bold text-gray-600">Vazgeç</Button>
                                    <Button onClick={() => handleConfirmBusinessAreaAction()} className={`flex-1 font-bold text-white ${businessAreaConfirm.type === 'ADD' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                                        {businessAreaConfirm.type === 'ADD' ? 'Evet, Ekle' : 'Evet, Sil'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div >
        </div >,
        document.body
    );
};

// Imports moved to top
// ... existing imports

export const LeasingManagement: React.FC = () => {
    const { backgroundMode, isPresentationMode } = useTheme();
    const isLight = backgroundMode === 'LIGHT';

    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [filterCampus, setFilterCampus] = useState('ALL');
    const [filterBlock, setFilterBlock] = useState('ALL');
    const [filterFloor, setFilterFloor] = useState('ALL');
    const [filterSector, setFilterSector] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState('ALL');

    // Async data states
    const [allLeases, setAllLeases] = useState<ExtendedLeaseData[]>([]);
    const [campuses, setCampuses] = useState<Campus[]>([]);
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [sectors, setSectors] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Handle incoming navigation state (e.g. from Dashboard chart click)
    const location = useLocation();
    useEffect(() => {
        if (location.state?.filterSector) {
            setFilterSector(location.state.filterSector);
        }
        if (location.state?.selectedBusinessTags) {
            setSelectedBusinessTags(location.state.selectedBusinessTags);
        }
    }, [location.state]);

    // New: Business Area Tag Filter
    const [selectedBusinessTags, setSelectedBusinessTags] = useState<string[]>([]);
    const [businessTagSearch, setBusinessTagSearch] = useState('');
    const [showBusinessTagDropdown, setShowBusinessTagDropdown] = useState(false);
    const businessTagInputRef = useRef<HTMLInputElement>(null);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [selectedLease, setSelectedLease] = useState<ExtendedLeaseData | null>(null);

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; companyId: string; companyName: string }>({ isOpen: false, companyId: '', companyName: '' });

    // Tutorial states
    const [showHelp, setShowHelp] = useState(false);
    const [helpSlide, setHelpSlide] = useState(0);

    // Tutorial Refs
    const addContractBtnRef = useRef<HTMLButtonElement>(null);
    const listTableRef = useRef<HTMLDivElement>(null);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    // Update tutorial highlight position
    useEffect(() => {
        let animationFrameId: number;

        const updateRect = () => {
            let target = null;
            if (helpSlide === 0) target = addContractBtnRef.current;
            else if (helpSlide === 1) target = listTableRef.current;

            if (target && showHelp) {
                const rect = target.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    setTargetRect(rect);
                }
            }
        };

        const handleScroll = () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(updateRect);
        };

        if (showHelp) {
            updateRect();
            setTimeout(updateRect, 100);
            window.addEventListener('resize', handleScroll);
            window.addEventListener('scroll', handleScroll, true);
        }

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleScroll);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [helpSlide, showHelp]);

    const handleInitiateDelete = (companyId: string, companyName: string) => {
        setDeleteModal({ isOpen: true, companyId, companyName });
    };

    const handleConfirmDelete = async () => {
        if (!deleteModal.companyId) return;
        try {
            await api.deleteLease(deleteModal.companyId);
            setDeleteModal({ isOpen: false, companyId: '', companyName: '' });
            // Refresh data
            fetchData();
            // Trigger event for Dashboard to refresh
            triggerDataChange('lease', 'delete');
        } catch (error) {
            alert('Silme işlemi başarısız oldu.');
        }
    };

    // Fetch all data
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [leasesData, campusesData, blocksData, sectorsData] = await Promise.all([
                api.getAllLeaseDetails(),
                api.getCampuses(),
                api.getBlocks(),
                api.getSectors()
            ]);
            setAllLeases(leasesData || []);
            setCampuses(campusesData || []);
            setBlocks(blocksData || []);
            setSectors(sectorsData || []);
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [refreshKey]);

    const filteredLeases = useMemo(() => {
        let res = allLeases;
        if (filterCampus !== 'ALL') res = res.filter(l => l.campus.id === filterCampus);
        if (filterBlock !== 'ALL') res = res.filter(l => l.block.id === filterBlock);
        if (filterFloor !== 'ALL') res = res.filter(l => l.unit.floor === filterFloor);
        if (filterSector !== 'ALL') res = res.filter(l => l.company.sector === filterSector);

        if (filterStatus === 'UNALLOCATED') res = res.filter(l => l.lease.id === 'PENDING' || !l.lease.unitId);
        if (filterStatus === 'ALLOCATED') res = res.filter(l => l.lease.id !== 'PENDING' && !!l.lease.unitId);

        // New: Filter by Selected Business Area Tags (AND Logic: Match ALL selected tags)
        if (selectedBusinessTags.length > 0) {
            res = res.filter(l => {
                const companyTags = l.company.businessAreas || [];
                return selectedBusinessTags.every(tag => companyTags.includes(tag));
            });
        }

        if (debouncedSearch) {
            const term = debouncedSearch.toLowerCase();
            res = res.filter(l =>
                (l.company.name && l.company.name.toLowerCase().includes(term)) ||
                (l.company.managerName && l.company.managerName.toLowerCase().includes(term)) ||
                (l.company.sector && l.company.sector.toLowerCase().includes(term)) ||
                (l.company.businessAreas && l.company.businessAreas.some(tag => tag && tag.toLowerCase().includes(term)))
            );
        }
        return res;
    }, [debouncedSearch, filterCampus, filterBlock, filterFloor, filterSector, filterStatus, allLeases, selectedBusinessTags]);

    const campusOptions = useMemo(() => [{ value: 'ALL', label: 'Tüm Kampüsler' }, ...campuses.map(c => ({ value: c.id, label: c.name }))], [campuses]);
    const blockOptions = useMemo(() => {
        if (filterCampus === 'ALL') return [{ value: 'ALL', label: 'Tüm Bloklar' }];
        const filteredBlocks = blocks.filter(b => b.campusId === filterCampus);
        return [{ value: 'ALL', label: 'Tüm Bloklar' }, ...filteredBlocks.map(b => ({ value: b.id, label: b.name }))];
    }, [filterCampus, blocks]);

    const floorOptions = useMemo(() => {
        let relevantBlocks = blocks;
        if (filterCampus !== 'ALL') relevantBlocks = relevantBlocks.filter(b => b.campusId === filterCampus);
        if (filterBlock !== 'ALL') relevantBlocks = relevantBlocks.filter(b => b.id === filterBlock);

        const uniqueFloors = new Set<string>();
        relevantBlocks.forEach(b => {
            if (b.floorCapacities) {
                b.floorCapacities.forEach(f => uniqueFloors.add(f.floor));
            }
        });

        const sortedFloors = Array.from(uniqueFloors).sort(sortFloors);
        return [{ value: 'ALL', label: 'Tüm Katlar' }, ...sortedFloors.map(f => ({ value: f, label: `${f}. Kat` }))];
    }, [blocks, filterCampus, filterBlock]);

    const sectorOptions = useMemo(() => [{ value: 'ALL', label: 'Tüm Sektörler' }, ...sectors.map(s => ({ value: s, label: s }))], [sectors]);
    const statusOptions = [{ value: 'ALL', label: 'Tüm Durumlar' }, { value: 'ALLOCATED', label: 'Tahsis Edildi' }, { value: 'UNALLOCATED', label: 'Tahsis Edilmedi' }];

    // Derive all unique business area tags from current leases
    const availableBusinessTags = useMemo(() => {
        const uniqueTags = new Set<string>();
        allLeases.forEach(l => {
            if (l.company.businessAreas) {
                l.company.businessAreas.forEach(tag => uniqueTags.add(tag));
            }
        });
        return Array.from(uniqueTags).sort();
    }, [allLeases]);

    const filteredBusinessTags = useMemo(() => {
        if (!businessTagSearch) return availableBusinessTags;
        return availableBusinessTags.filter(tag => tag.toLowerCase().includes(businessTagSearch.toLowerCase()));
    }, [availableBusinessTags, businessTagSearch]);

    const toggleBusinessTag = (tag: string) => {
        if (selectedBusinessTags.includes(tag)) {
            setSelectedBusinessTags(prev => prev.filter(t => t !== tag));
        } else {
            setSelectedBusinessTags(prev => [...prev, tag]);
        }
        setBusinessTagSearch(''); // Clear search after selection
        businessTagInputRef.current?.focus();
    };

    return (
        <div className="flex flex-col gap-6 h-full pb-20">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className={`text-2xl font-bold drop-shadow-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>Sözleşme Yönetimi</h1>
                    <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-slate-200'}`}>Kiracı firmalar, sözleşmeler ve bekleyen tahsisatların listesi.</p>
                </div>
                <Button ref={addContractBtnRef} onClick={() => setIsAddModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/30">
                    <Plus className="w-4 h-4" /> Yeni Sözleşme
                </Button>
            </div>

            <div className="flex flex-col gap-3 w-full z-40 relative">
                <div className="relative w-full">
                    <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-200 shadow-sm transition-all focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
                        <Search className="w-5 h-5 text-gray-400" />
                        <input type="text" className="w-full bg-transparent border-none outline-none text-sm font-bold text-gray-900 placeholder:text-gray-400" placeholder="Firma, yönetici veya sektör ara..." value={search} onChange={e => setSearch(sanitizeInput(e.target.value))} />
                        {search && <button onClick={() => setSearch('')} className="p-1 hover:bg-gray-100 rounded-full"><X className="w-4 h-4 text-gray-400" /></button>}
                    </div>
                </div>

                {/* Business Area Tag Filter Section */}
                <div className="relative w-full z-50">
                    <div className="flex flex-col gap-2 bg-gradient-to-r from-indigo-50 to-white p-5 rounded-2xl border-2 border-indigo-200 shadow-md transition-all hover:shadow-lg focus-within:ring-4 focus-within:ring-indigo-500/20 focus-within:border-indigo-400">
                        <label className="text-xs font-black text-indigo-700 uppercase tracking-wider flex items-center gap-2 ml-1">
                            <div className="p-1 bg-indigo-200 rounded text-indigo-700">
                                <Tag className="w-4 h-4" />
                            </div>
                            İş Alanı Etiketleri
                        </label>

                        <div className="flex flex-wrap items-center gap-2">
                            {selectedBusinessTags.map(tag => (
                                <span key={tag} className="flex items-center gap-1 pl-3 pr-1 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm animate-in fade-in zoom-in-95 ring-1 ring-indigo-500 ring-offset-1">
                                    {tag}
                                    <button
                                        onClick={() => setSelectedBusinessTags(prev => prev.filter(t => t !== tag))}
                                        className="p-0.5 hover:bg-white/20 rounded-md transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </span>
                            ))}

                            <div className="relative flex-1 min-w-[200px] group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 group-focus-within:text-indigo-600 transition-colors" />
                                <input
                                    ref={businessTagInputRef}
                                    type="text"
                                    className="w-full pl-10 pr-4 py-2 bg-white/60 border border-indigo-100 outline-none text-xs font-bold text-gray-900 placeholder:text-indigo-300 h-10 rounded-xl focus:bg-white focus:border-indigo-300 transition-all shadow-sm"
                                    placeholder="Filtrelemek istediğiniz iş alanı etiketlerini seçin..."
                                    value={businessTagSearch}
                                    onChange={e => setBusinessTagSearch(e.target.value)}
                                    onFocus={() => setShowBusinessTagDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowBusinessTagDropdown(false), 200)}
                                />
                                {showBusinessTagDropdown && (
                                    <div className="absolute top-full left-0 mt-2 w-full max-w-md bg-white rounded-xl shadow-xl border border-indigo-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2">
                                        <div className="max-h-[220px] overflow-y-auto custom-scrollbar p-2 bg-slate-50/50">
                                            {filteredBusinessTags.length > 0 ? (
                                                filteredBusinessTags.map(tag => {
                                                    const isSelected = selectedBusinessTags.includes(tag);
                                                    return (
                                                        <button
                                                            key={tag}
                                                            onMouseDown={(e) => { e.preventDefault(); toggleBusinessTag(tag); }}
                                                            className={`w-full text-left px-3 py-2.5 mb-1 last:mb-0 rounded-lg text-xs font-bold flex items-center justify-between transition-all ${isSelected ? 'bg-indigo-100 text-indigo-700 shadow-sm border border-indigo-200' : 'bg-white border border-transparent hover:border-indigo-200 text-gray-700 hover:shadow-sm'}`}
                                                        >
                                                            <span>{tag}</span>
                                                            {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                                                        </button>
                                                    );
                                                })
                                            ) : (
                                                <div className="p-4 text-center text-xs text-gray-400 font-medium italic">
                                                    "{businessTagSearch}" ile eşleşen etiket bulunamadı.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-gray-200 p-4 shadow-sm grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Kampüs</label>
                        <Dropdown options={campusOptions} value={filterCampus} onChange={(val) => { setFilterCampus(val); setFilterBlock('ALL'); setFilterFloor('ALL'); }} icon={<MapPin size={14} />} className="text-xs" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Blok</label>
                        <Dropdown options={blockOptions} value={filterBlock} onChange={(val) => { setFilterBlock(val); setFilterFloor('ALL'); }} icon={<Building size={14} />} className="text-xs" disabled={filterCampus === 'ALL' && blockOptions.length <= 1} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Kat</label>
                        <Dropdown options={floorOptions} value={filterFloor} onChange={setFilterFloor} icon={<Layers size={14} />} className="text-xs" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Sektör</label>
                        <Dropdown options={sectorOptions} value={filterSector} onChange={setFilterSector} icon={<Briefcase size={14} />} className="text-xs" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Durum</label>
                        <Dropdown options={statusOptions} value={filterStatus} onChange={setFilterStatus} icon={<Filter size={14} />} className="text-xs" />
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-[560px] sm:h-[calc(100vh-380px)]">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        <span className="text-sm font-bold text-gray-500">Yükleniyor...</span>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header Row */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-2 items-center rounded-xl bg-gray-50/50 border border-gray-100 mb-1">
                        <div className="col-span-3 text-[10px] font-black text-black uppercase tracking-wider pl-10">Firma Değerleri</div>
                        <div className="col-span-2 text-center text-[10px] font-black text-black uppercase tracking-wider">Durum</div>
                        <div className="col-span-3 text-[10px] font-black text-black uppercase tracking-wider">Konum Bilgisi</div>
                        <div className="col-span-2 text-center text-[10px] font-black text-black uppercase tracking-wider">Kira Bilgisi</div>
                        <div className="col-span-2 text-right text-[10px] font-black text-black uppercase tracking-wider pr-8">Karne Puanı</div>
                    </div>

                    <div ref={listTableRef} className="h-[560px] sm:h-[calc(100vh-380px)]">
                        <AnimatedList
                            items={filteredLeases}
                            renderItem={(item: ExtendedLeaseData, index, isSelected) => (
                                <LeaseRowItem
                                    item={item}
                                    isSelected={isSelected}
                                    onClick={() => setSelectedLease(item)}
                                    onDelete={() => handleInitiateDelete(item.company.id, item.company.name)}
                                />
                            )}
                            onItemSelect={(item) => setSelectedLease(item as ExtendedLeaseData)}
                        />
                    </div>

                    {isAddModalOpen && <AddLeaseModal onClose={() => setIsAddModalOpen(false)} onSuccess={() => { setIsAddModalOpen(false); setRefreshKey(p => p + 1); }} />}
                    <DeleteConfirmModal
                        isOpen={deleteModal.isOpen}
                        title={`${deleteModal.companyName} Sözleşmesini Sil`}
                        onClose={() => setDeleteModal({ isOpen: false, companyId: '', companyName: '' })}
                        onConfirm={handleConfirmDelete}
                    />
                </>
            )}
            {selectedLease && <CompanyDetailModal
                data={selectedLease}
                onClose={() => setSelectedLease(null)}
                onUpdate={async () => {
                    await fetchData();
                    const updated = allLeases.find(l => l.company.id === selectedLease.company.id);
                    if (updated) setSelectedLease(updated);
                }}
            />}

            {/* Interactive Tutorial System via Portal */}
            {showHelp && createPortal(
                <div className="fixed inset-0 z-[10000] pointer-events-auto isolate">
                    {/* Dynamic Highlighter Box */}
                    {targetRect && (
                        <div
                            className="fixed z-[10001] pointer-events-none rounded-2xl"
                            style={{
                                top: targetRect.top - 4,
                                left: targetRect.left - 4,
                                width: targetRect.width + 8,
                                height: targetRect.height + 8,
                                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.65)' // Cutout effect
                            }}
                        >
                            {/* Border Ring */}
                            <div className={`absolute inset-0 rounded-2xl border-[3px] animate-pulse ${helpSlide === 0 ? 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.5)]' :
                                'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
                                }`}></div>
                        </div>
                    )}

                    {/* Tutorial Cards - Positioned Relative to Target */}
                    {targetRect && (
                        <div
                            className={`fixed z-[10002] bg-white rounded-2xl shadow-2xl p-5 max-w-sm border-2 animate-in fade-in zoom-in-95 duration-300 ${helpSlide === 0 ? 'border-rose-500' : 'border-indigo-500'}`}
                            style={{
                                top: Math.min(window.innerHeight - 250, targetRect.bottom + 16),
                                left: Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 192), window.innerWidth - 400)
                            }}
                        >
                            {/* Arrow */}
                            <div
                                className={`absolute -top-2 w-4 h-4 bg-white border-t-2 border-l-2 transform rotate-45 ${helpSlide === 0 ? 'border-rose-500' : 'border-indigo-500'}`}
                                style={{
                                    left: Math.min(Math.max(20, (targetRect.left - Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 192), window.innerWidth - 400)) + (targetRect.width / 2) - 8), 340)
                                }}
                            ></div>

                            {helpSlide === 0 && (
                                <>
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="p-2 bg-rose-100 rounded-lg shrink-0">
                                            <Plus className="w-5 h-5 text-rose-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 text-base">Yeni Sözleşme Ekle</h3>
                                            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                                Buradan sisteme yeni bir firma ve sözleşme kaydı oluşturabilirsiniz. Bu işlem henüz ofis tahsisi yapmaz, sadece firmayı sisteme tanıtır.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Atla</button>
                                        <button onClick={() => setHelpSlide(1)} className="px-3 py-1.5 text-xs font-bold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200">Sıradaki</button>
                                    </div>
                                </>
                            )}

                            {helpSlide === 1 && (
                                <>
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                                            <Building2 className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 text-base">Firma Listesi ve Tahsis</h3>
                                            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                                Eklediğiniz firmaları burada listeleyebilirsiniz. Bu firmaları daha sonra <b>Bina Yönetimi</b> sayfasından dilediğiniz ofise tahsis edebilirsiniz.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Kapat</button>
                                        <button onClick={() => { setShowHelp(false); setHelpSlide(0); }} className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">Tamamla</button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>,
                document.body
            )}

            {/* Floating Tutorial Button */}
            <button
                onClick={() => { setShowHelp(true); setHelpSlide(0); }}
                className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group z-[9998]"
                title="Sözleşme Yönetimi Rehberi"
            >
                <Info className="w-7 h-7 group-hover:scale-110 transition-transform" />
            </button>
        </div>
    );
};