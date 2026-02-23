
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

interface DeleteConfirmModalProps {
    isOpen: boolean;
    title: string;
    onClose: () => void;
    onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ isOpen, title, onClose, onConfirm }) => {
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
