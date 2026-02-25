
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { ExtendedLeaseData, LeaseDocument, ScoreItem } from '../types';
import { X, Save, User, Phone, Mail, Calculator, Calendar, Building2, Upload, FileText, Download, Trash2, Plus, MessageSquare, ShieldCheck, Tag, Info, Award, Check, Briefcase, File, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { motion, AnimatePresence } from 'motion/react';

// Helpers
const sanitizeInput = api.sanitizeInput;

const SCORE_CATEGORIES = [
    {
        id: 'ARGE_NITELIK', label: 'Ar-Ge Niteliği Artırma', maxPoints: 28, items: [
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
        id: 'HIZMET_ALMA', label: 'Dijitalpark’tan Hizmet Alma', maxPoints: 23, items: [
            { label: 'Mentorluk Alma', points: 2 },
            { label: 'Eğitim Faaliyetlerine Katılım', points: 2 },
            { label: 'Proje Yazdırma (AR Projesi)', points: 10 }
        ]
    },
    {
        id: 'TEKNOKENT_SUREC', label: 'Teknokent Süreçlerine Destek veya Katılım', maxPoints: 20, items: [
            { label: 'Teknokent Etkinliklerine Katılım', points: 5 },
            { label: 'Üniversite Sanayi İşbirliği Portalı Kaydı', points: 5 },
            { label: 'Stajyer İstihdamı', points: 5 },
            { label: 'Teknokent Yönetimine Raporlama', points: 5 }
        ]
    },
    {
        id: 'ULUSLARARASILASMA', label: 'Uluslararasılaşma', maxPoints: 15, items: [
            { label: 'Yurtdışı Fuar Katılımı', points: 5 },
            { label: 'Yurtdışı Ofis/Şube Açılışı', points: 5 },
            { label: 'İhracat Yapılması', points: 5 }
        ]
    },
    {
        id: 'IDARI_ISLER', label: 'Teknokent İdari İşleri', maxPoints: 14, items: [
            { label: 'Kira/İşletme Gideri Düzenli Ödeme', points: 7 },
            { label: 'Yönetim Kurulu Kararlarına Uyum', points: 7 }
        ]
    }
];

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

interface CompanyDetailModalProps {
    data: ExtendedLeaseData;
    onClose: () => void;
    onUpdate: () => void;
}

export const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({ data, onClose, onUpdate }) => {
    const [activeTab, setActiveTab] = useState<'INFO' | 'SCORE' | 'CONTRACTS' | 'WORK_AREAS'>('INFO');
    const isUnallocated = data.lease.id === 'PENDING' || !data.lease.unitId;

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
        operatingFee: data.lease.operatingFee || 400,
        monthlyRent: data.lease.monthlyRent || 0
    });

    const [isEditMode, setIsEditMode] = useState(false);
    const [sectors, setSectors] = useState<string[]>([]);

    useEffect(() => {
        api.getSectors().then(setSectors);
    }, []);

    const handleSaveCompanyInfo = async () => {
        try {
            // If sector is new, add it
            if (editFormData.sector && !sectors.includes(editFormData.sector)) {
                await api.addSector(editFormData.sector);
            }

            await api.updateCompany(data.company.id, {
                name: sanitizeInput(editFormData.name),
                sector: sanitizeInput(editFormData.sector),
                managerName: sanitizeInput(editFormData.managerName),
                managerPhone: sanitizeInput(editFormData.managerPhone),
                managerEmail: sanitizeInput(editFormData.managerEmail),
                employeeCount: editFormData.employeeCount
            });

            if (editFormData.startDate.length === 10 && editFormData.endDate.length === 10) {
                await api.updateLeaseDates(data.company.id, convertToISO(editFormData.startDate), convertToISO(editFormData.endDate));
            }

            await api.updateLease(data.company.id, {
                operatingFee: editFormData.operatingFee,
                monthlyRent: editFormData.monthlyRent
            });

            setIsEditMode(false);
            onUpdate();
        } catch (err) {
            console.error(err);
            alert('Güncelleme sırasında bir hata oluştu.');
        }
    };

    // Business Areas
    const [isSectorEditMode, setIsSectorEditMode] = useState(false);
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

    const handleSaveBusinessAreas = async () => {
        try {
            await api.updateCompany(data.company.id, { ...data.company, businessAreas: editFormData.businessAreas });
            onUpdate();
        } catch (err) { console.error(err); }
    };

    // Scores
    const [newScore, setNewScore] = useState({ categoryId: '', itemId: -1, points: 0, desc: '' });
    const [activeDropdown, setActiveDropdown] = useState<'category' | 'item' | null>(null);

    const handleAddScore = async () => {
        if (!newScore.categoryId || newScore.itemId === -1) return;
        try {
            const category = SCORE_CATEGORIES.find(c => c.id === newScore.categoryId);
            const item = category?.items[newScore.itemId];
            if (!item) return;

            await api.addCompanyScore(data.company.id, {
                categoryId: newScore.categoryId,
                categoryLabel: category!.label,
                itemLabel: item.label,
                points: item.points,
                description: newScore.desc,
                documents: [] // Documents implementation omitted for brevity in this extraction, can be added
            });
            onUpdate();
            setNewScore({ categoryId: '', itemId: -1, points: 0, desc: '' });
        } catch (e) { console.error(e); }
    };

    const handleDeleteScore = async (scoreId: string) => {
        try {
            await api.deleteCompanyScore(data.company.id, scoreId);
            onUpdate();
        } catch (e) { console.error(e); }
    };


    // Documents
    const [documents, setDocuments] = useState<LeaseDocument[]>(
        data.lease.id === 'PENDING' ? (data.company.documents || []) : (data.lease.documents || [])
    );

    useEffect(() => {
        setDocuments(data.lease.id === 'PENDING' ? (data.company.documents || []) : (data.lease.documents || []));
    }, [data.lease, data.company.documents]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Url = reader.result as string;

                const newDoc: LeaseDocument = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    type: 'OTHER',
                    url: base64Url,
                    uploadDate: new Date().toISOString()
                } as any; // Type assertion if uploadDate isn't directly in LeaseDocument

                try {
                    await api.addDocument(data.company.id, newDoc, data.lease.id === 'PENDING');
                    onUpdate(); // Re-fetch data, the useEffect will update the state
                } catch (e: any) {
                    console.error(e);
                    alert(e.message || "Belge yüklenirken bir hata oluştu.");
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDeleteDocument = async (docId: string, docName: string) => {
        try {
            await api.deleteDocument(data.company.id, docName, data.lease.id === 'PENDING');
            onUpdate();
        } catch (e) { console.error(e); }
    };


    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-start shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-black text-xl border border-indigo-100">
                            {data.company.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{data.company.name}</h2>
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mt-1">
                                <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{data.company.sector}</span>
                                {isUnallocated ? <span className="text-amber-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Ofis Tahsis Edilmedi</span> : <span>{data.campus.name} • {data.block.name} • Kat {data.unit.floor} • No {data.unit.number}</span>}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-gray-600" /></button>
                </div>

                {/* Tabs */}
                {/* ... Tab Navigation ... */}
                <div className="flex border-b border-gray-100 px-6 shrink-0 gap-6">
                    {['INFO', 'SCORE', 'CONTRACTS', 'WORK_AREAS'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`py-4 text-xs font-bold border-b-2 transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            {tab === 'INFO' ? 'Firma Bilgileri' : tab === 'SCORE' ? 'Karne & Puanlama' : tab === 'CONTRACTS' ? 'Sözleşme & Belgeler' : 'İş Alanları'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    {activeTab === 'INFO' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Form fields reusing isEditMode */}
                            <div className="space-y-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold flex items-center gap-2"><Building2 className="w-4 h-4" /> Temel Bilgiler</h3>
                                    <Button variant="ghost" onClick={() => {
                                        if (isEditMode) {
                                            setIsEditMode(false);
                                            setEditFormData({
                                                name: data.company.name,
                                                sector: data.company.sector,
                                                businessAreas: data.company.businessAreas || [],
                                                managerName: data.company.managerName,
                                                managerPhone: data.company.managerPhone,
                                                managerEmail: data.company.managerEmail,
                                                employeeCount: data.company.employeeCount,
                                                startDate: isoToDisplay(data.lease.startDate),
                                                endDate: isoToDisplay(data.lease.endDate),
                                                operatingFee: data.lease.operatingFee || 400,
                                                monthlyRent: data.lease.monthlyRent || 0
                                            });
                                        } else {
                                            setIsEditMode(true);
                                        }
                                    }}>{isEditMode ? 'İptal' : 'Düzenle'}</Button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-gray-500">Ünvan</label><input disabled={!isEditMode} value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} className="w-full border p-2 rounded text-sm" /></div>
                                    <div><label className="text-xs font-bold text-gray-500">Sektör</label><input disabled={!isEditMode} value={editFormData.sector} onChange={e => setEditFormData({ ...editFormData, sector: e.target.value })} className="w-full border p-2 rounded text-sm" /></div>
                                </div>
                                {/* Manager Info */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-gray-500">Yönetici</label><input disabled={!isEditMode} value={editFormData.managerName} onChange={e => setEditFormData({ ...editFormData, managerName: e.target.value })} className="w-full border p-2 rounded text-sm" /></div>
                                    <div><label className="text-xs font-bold text-gray-500">Telefon</label><input disabled={!isEditMode} value={editFormData.managerPhone} onChange={e => setEditFormData({ ...editFormData, managerPhone: e.target.value })} className="w-full border p-2 rounded text-sm" /></div>
                                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500">E-Posta</label><input disabled={!isEditMode} value={editFormData.managerEmail} onChange={e => setEditFormData({ ...editFormData, managerEmail: e.target.value })} className="w-full border p-2 rounded text-sm" /></div>
                                </div>
                            </div>
                            {/* Lease Info */}
                            <div className="space-y-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold flex items-center gap-2"><Calculator className="w-4 h-4" /> Kira & Sözleşme</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-gray-500">Kira Bedeli (TL/Ay)</label><input type="number" disabled={!isEditMode} value={editFormData.monthlyRent} onChange={e => setEditFormData({ ...editFormData, monthlyRent: parseFloat(e.target.value) })} className="w-full border p-2 rounded text-sm" /></div>
                                    <div><label className="text-xs font-bold text-gray-500">Aidat (TL/Ay)</label><input type="number" disabled={!isEditMode} value={editFormData.operatingFee} onChange={e => setEditFormData({ ...editFormData, operatingFee: parseFloat(e.target.value) })} className="w-full border p-2 rounded text-sm" /></div>
                                    <div><label className="text-xs font-bold text-gray-500">Başlangıç</label><input disabled={!isEditMode} value={editFormData.startDate} onChange={e => setEditFormData({ ...editFormData, startDate: formatDateInput(e.target.value) })} className="w-full border p-2 rounded text-sm" /></div>
                                    <div><label className="text-xs font-bold text-gray-500">Bitiş</label><input disabled={!isEditMode} value={editFormData.endDate} onChange={e => setEditFormData({ ...editFormData, endDate: formatDateInput(e.target.value) })} className="w-full border p-2 rounded text-sm" /></div>
                                </div>
                                {isEditMode && <Button onClick={handleSaveCompanyInfo} className="w-full mt-4"><Save className="w-4 h-4 mr-2" /> Kaydet</Button>}
                            </div>
                        </div>
                    )}

                    {activeTab === 'SCORE' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-200">{data.company.score}</div>
                                    <div><div className="text-xs font-bold text-indigo-800 uppercase">Toplam Puan</div><div className="text-xs text-indigo-600">Bu yılki performans</div></div>
                                </div>
                            </div>
                            {/* Add Score Form */}
                            <div className="bg-white p-4 rounded-xl border border-gray-200 mb-6 space-y-3">
                                <h4 className="font-bold text-sm">Puan Ekle</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <select className="border p-2 rounded" value={newScore.categoryId} onChange={e => setNewScore({ ...newScore, categoryId: e.target.value, itemId: -1 })}>
                                        <option value="">Kategori Seçin</option>
                                        {SCORE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                    <select className="border p-2 rounded" value={newScore.itemId} onChange={e => {
                                        const idx = parseInt(e.target.value);
                                        const cat = SCORE_CATEGORIES.find(c => c.id === newScore.categoryId);
                                        setNewScore({ ...newScore, itemId: idx, points: cat?.items[idx]?.points || 0 });
                                    }} disabled={!newScore.categoryId}>
                                        <option value={-1}>İşlem Seçin</option>
                                        {newScore.categoryId && SCORE_CATEGORIES.find(c => c.id === newScore.categoryId)?.items.map((item, idx) => (
                                            <option key={idx} value={idx}>{item.label} ({item.points} Puan)</option>
                                        ))}
                                    </select>
                                </div>
                                <input placeholder="Açıklama" className="w-full border p-2 rounded" value={newScore.desc} onChange={e => setNewScore({ ...newScore, desc: e.target.value })} />
                                <div className="flex justify-end"><Button onClick={handleAddScore} disabled={!newScore.categoryId || newScore.itemId === -1}>Ekle</Button></div>
                            </div>
                            {/* Score History List */}
                            <div className="space-y-2">
                                {(data.company.scoreHistory || []).map(score => (
                                    <div key={score.id} className="bg-white p-3 rounded-xl border flex justify-between items-center">
                                        <div><div className="font-bold text-sm">{score.itemLabel}</div><div className="text-xs text-gray-500">{score.categoryLabel}</div></div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-bold text-indigo-600">+{score.points}</span>
                                            <button onClick={() => handleDeleteScore(score.id)} className="text-gray-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'CONTRACTS' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold">Dökümanlar</h3>
                                <div className="relative">
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                                    <Button onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Dosya Yükle</Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {documents.map(doc => (
                                    <div key={doc.id} className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center group">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-50 rounded text-indigo-600"><FileText className="w-5 h-5" /></div>
                                            <div><div className="font-bold text-sm truncate max-w-[150px]">{doc.name}</div><div className="text-xs text-gray-400">{new Date(doc.uploadDate!).toLocaleDateString('tr-TR')}</div></div>
                                        </div>
                                        <div className="flex gap-2">
                                            <a href={doc.url} download className="p-2 hover:bg-gray-100 rounded text-gray-500"><Download className="w-4 h-4" /></a>
                                            <button onClick={() => handleDeleteDocument(doc.id, doc.name)} className="p-2 hover:bg-rose-50 rounded text-gray-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'WORK_AREAS' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold">İş Alanları</h3>
                                <Button onClick={handleSaveBusinessAreas}><Save className="w-4 h-4 mr-2" /> Kaydet</Button>
                            </div>
                            {/* Business Areas Selection UI */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {sectors.map(s => {
                                    const isSelected = editFormData.businessAreas.includes(s);
                                    return (
                                        <button key={s} onClick={() => handleToggleBusinessArea(s)} className={`p-2 rounded border text-xs text-left font-bold truncate ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                                            {s} {isSelected && <Check className="w-3 h-3 float-right" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>,
        document.body
    );
};
