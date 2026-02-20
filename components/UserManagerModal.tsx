import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, UserPlus, Check, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { api } from '../services/api';

interface UserManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const UserManagerModal: React.FC<UserManagerModalProps> = ({ isOpen, onClose }) => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        role: 'VIEWER' as 'MANAGER' | 'VIEWER'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            await api.registerUser(formData);
            setSuccess('Kullanıcı başarıyla oluşturuldu!');
            setFormData({ username: '', email: '', password: '', role: 'VIEWER' });
            setTimeout(() => {
                onClose();
                setSuccess('');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Kullanıcı oluşturulurken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
                    />
                    <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden border border-gray-100"
                        >
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                        <UserPlus className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900">Yeni Kullanıcı</h2>
                                        <p className="text-xs text-gray-500">Sisteme yeni bir kullanıcı ekleyin.</p>
                                    </div>
                                </div>
                                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6">
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {error && (
                                        <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-600 text-sm rounded-lg font-medium">
                                            <AlertCircle className="w-4 h-4" />
                                            {error}
                                        </div>
                                    )}
                                    {success && (
                                        <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-600 text-sm rounded-lg font-medium">
                                            <Check className="w-4 h-4" />
                                            {success}
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Kullanıcı Adı</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.username}
                                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-gray-900 text-sm"
                                            placeholder="ornek_kullanici"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">E-posta</label>
                                        <input
                                            type="email"
                                            required
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-gray-900 text-sm"
                                            placeholder="mail@ornek.com"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Şifre</label>
                                        <input
                                            type="password"
                                            required
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-gray-900 text-sm"
                                            placeholder="••••••••"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Rol</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, role: 'VIEWER' })}
                                                className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${formData.role === 'VIEWER' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                İzleyici (Viewer)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, role: 'MANAGER' })}
                                                className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${formData.role === 'MANAGER' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                Yönetici (Manager)
                                            </button>
                                        </div>
                                    </div>

                                    <div className="pt-2 flex gap-3">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="flex-1"
                                            onClick={onClose}
                                        >
                                            İptal
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                                            disabled={loading}
                                        >
                                            {loading ? 'Oluşturuluyor...' : 'Kullanıcı Oluştur'}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};
