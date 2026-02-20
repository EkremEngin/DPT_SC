
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api'; // using api instead of db
import { Plus, X, AlertCircle, Building2, User, Phone, Minus, Mail, Calculator, Calendar, Save } from 'lucide-react';
import { Button } from './Button';
import { motion } from 'motion/react';


// Using api.sanitizeInput
const sanitizeInput = api.sanitizeInput;

interface AddLeaseModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const AddLeaseModal: React.FC<AddLeaseModalProps> = ({ onClose, onSuccess }) => {
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

    useEffect(() => {
        api.getSectors().then(setSectors);
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
        if (formData.managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.managerEmail)) return false;
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

    const formatPhoneNumber = (val: string) => {
        let raw = val.replace(/\D/g, '');
        if (raw.startsWith('0')) raw = raw.slice(1);
        raw = raw.slice(0, 10);
        if (raw.length > 8) return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6, 8)} ${raw.slice(8)}`;
        else if (raw.length > 6) return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`;
        else if (raw.length > 3) return `${raw.slice(0, 3)} ${raw.slice(3)}`;
        else return raw;
    };

    const toTitleCaseTurkish = (str: string) => {
        return str.split(' ').map(word => {
            if (word.length === 0) return '';
            return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
        }).join(' ');
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

            await api.registerCompany({
                name: sanitizeInput(formData.companyName),
                registrationNumber: `TR-${Math.floor(Math.random() * 900000) + 100000}`,
                sector: sanitizeInput(formData.sector),
                businessAreas: [sanitizeInput(formData.sector)],
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
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const RequiredMark = () => (
        <div className="group relative inline-flex ml-1 cursor-help align-text-bottom">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
        </div>
    );

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
                        {/* More fields similar to original ... collapsed for brevity but included in full code */}
                        {/* Manager Name */}
                        <div className="space-y-4">
                            <div>
                                <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase mb-1">
                                    Yönetici Adı Soyadı <RequiredMark />
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="text" className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 outline-none" placeholder="Ad Soyad" value={formData.managerName} onChange={(e) => handleTextChange(e, 'managerName')} />
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
                                        <input type="email" className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 outline-none" placeholder="isim@firma.com" value={formData.managerEmail} onChange={e => setFormData({ ...formData, managerEmail: sanitizeInput(e.target.value) })} />
                                    </div>
                                    {showSecEmail && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <input type="email" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-bold text-black bg-white focus:border-indigo-500 outline-none" placeholder="İkincil E-Posta" value={formData.secManagerEmail} onChange={e => setFormData({ ...formData, secManagerEmail: sanitizeInput(e.target.value) })} />
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Contract Terms */}
                        <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                            <h4 className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Calculator className="w-3.5 h-3.5" /> Sözleşme Şartları
                            </h4>
                            <div>
                                <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase mb-1">
                                    Anlaşılan Birim Fiyat (TL/m²) <RequiredMark />
                                </label>
                                <div className="relative">
                                    <input type="number" min="0" className="w-full p-2 border border-gray-300 rounded-lg text-lg font-black text-black bg-white focus:border-indigo-500 outline-none" value={formData.rentPerSqm === 0 ? '' : formData.rentPerSqm} onChange={e => setFormData({ ...formData, rentPerSqm: parseFloat(e.target.value) || 0 })} />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">TL / m²</span>
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
