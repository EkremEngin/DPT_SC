import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Filter, Clock, Tag, RefreshCw, X, Search, Terminal, Activity, ChevronRight, ChevronLeft, User, AlertTriangle, RotateCcw, CheckCircle, Info, Loader2 } from 'lucide-react';
import { Dropdown } from '../components/Dropdown';
import { AuditLog, RollbackPreview } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface LogDetailsModalProps {
  log: AuditLog | null;
  onClose: () => void;
  onRollback: (log: AuditLog) => void;
}

const LogDetailsModal: React.FC<LogDetailsModalProps> = ({ log, onClose, onRollback }) => {
  const [preview, setPreview] = useState<RollbackPreview | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  if (!log) return null;

  const handleRollbackClick = async () => {
    // 1. Get Preview
    setIsLoadingPreview(true);
    try {
      const result = await api.getRollbackPreview(log.id);
      setPreview(result);
      setShowConfirm(true);
    } catch (error: any) {
      alert('Geri alma önizleme hatası: ' + error.message);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConfirm = () => {
    onRollback(log);
    setShowConfirm(false);
    onClose();
  };

  const isRollbackViable = () => {
    if (log.action !== 'DELETE') return false;
    const diffTime = Math.abs(new Date().getTime() - new Date(log.timestamp).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && log.rollbackData;
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Activity className="w-6 h-6 text-indigo-600" />
                Log Detayları
              </h2>
              <p className="text-sm text-slate-500 font-mono mt-1">{log.traceId}</p>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <User className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{log.user || 'Sistem Yöneticisi'}</h3>
                <p className="text-xs text-slate-500">{log.userRole || 'ADMIN'} • {new Date(log.timestamp).toLocaleString('tr-TR')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase">İşlem</span>
                <p className="font-bold text-slate-800 text-sm mt-1">{log.action}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase">Kaynak</span>
                <p className="font-bold text-slate-800 text-sm mt-1">{log.entityType}</p>
              </div>
            </div>

            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
              <span className="text-xs font-bold text-indigo-400 uppercase block mb-2">Detaylar</span>
              <p className="text-sm font-medium text-slate-700 leading-relaxed">{log.details}</p>
            </div>

            {log.impact && (
              <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-xl">
                <span className="text-xs font-bold text-orange-500 uppercase block mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Etki Analizi
                </span>
                <p className="text-sm font-bold text-slate-700">{log.impact}</p>
              </div>
            )}

            <div className="hidden">
              <pre>{JSON.stringify(log.rollbackData)}</pre>
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              Kapat
            </button>
            {isRollbackViable() && (
              <button
                onClick={handleRollbackClick}
                disabled={isLoadingPreview}
                className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                {isLoadingPreview ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Yükleniyor...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    Geri Al
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Confirmation Overlay */}
        <AnimatePresence>
          {showConfirm && preview && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute inset-0 z-10 bg-white p-6 flex flex-col"
            >
              <div className="flex-1 overflow-y-auto">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  {preview.type === 'SAFE' ? <CheckCircle className="text-green-500" /> : <AlertTriangle className="text-amber-500" />}
                  Geri Alma Analizi
                </h3>

                <div className={`p-4 rounded-xl border mb-4 ${preview.type === 'SAFE' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                  {preview.messages?.length > 0 ? (
                    <ul className="space-y-2">
                      {preview.messages.map((msg, i) => (
                        <li key={i} className="text-sm font-medium flex items-start gap-2">
                          <span className="mt-1 block w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                          {msg}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm font-medium">Analiz sonucu mesajı yok.</p>
                  )}
                </div>

                <p className="text-sm text-slate-500">
                  Bu işlemi onayladığınızda, sistem veritabanında yukarıdaki değişiklikler uygulanacaktır. Bu işlem geri alınamaz.
                </p>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  İptal
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg ${preview.type === 'SAFE' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Onayla ve Geri Al
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>,
    document.body
  );
};

export const AuditLogs: React.FC = () => {
  const { backgroundMode } = useTheme();
  const { user } = useAuth();
  const isLight = backgroundMode === 'LIGHT';

  // Access Control: Viewers cannot see audit logs
  if (user?.role === 'VIEWER') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 transition-colors duration-300">
        <div className={`max-w-md w-full p-8 rounded-2xl border text-center ${isLight ? 'bg-white border-slate-200 shadow-xl' : 'bg-slate-800 border-slate-700 shadow-2xl'}`}>
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-red-600" />
          </div>
          <h2 className={`text-2xl font-bold mb-3 ${isLight ? 'text-slate-800' : 'text-white'}`}>Erişim Engellendi</h2>
          <p className={`text-sm mb-8 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Bu sayfayı görüntülemek için yetkiniz bulunmamaktadır. Log kayıtları sadece YÖNETİCİ ve ADMİN yetkisine sahip kullanıcılar tarafından görüntülenebilir.
          </p>
          <div className={`p-4 rounded-xl border text-left flex items-start gap-3 ${isLight ? 'bg-slate-50 border-slate-100' : 'bg-slate-900/50 border-slate-700'}`}>
            <Info className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`} />
            <div>
              <p className={`text-xs font-bold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Mevcut Rolünüz: İzleyici (Viewer)</p>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Daha yüksek yetki seviyesi için sistem yöneticiniz ile iletişime geçiniz.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Fetch logs on mount
  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getLogs();
      setLogs(response.data || []);
    } catch (err: any) {
      setError(err.message || 'Log kayıtları yüklenirken hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  // Tutorial states
  const [showHelp, setShowHelp] = useState(false);
  const [helpSlide, setHelpSlide] = useState(0);

  // Tutorial Refs
  const filterToolbarRef = useRef<HTMLDivElement>(null);
  const logsTableRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Update tutorial highlight position
  useEffect(() => {
    let animationFrameId: number;

    const updateRect = () => {
      let target = null;
      if (helpSlide === 0) target = filterToolbarRef.current;
      else if (helpSlide === 1) target = logsTableRef.current;

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

  const refreshLogs = async () => {
    await fetchLogs();
  };

  const handleRollback = async (log: AuditLog) => {
    try {
      await api.rollbackTransaction(log.id);
      await refreshLogs(); // Refresh list to see rollback log
      alert("Geri alma işlemi başarıyla tamamlandı.");
    } catch (e: any) {
      alert("Hata: " + e.message);
    }
  };

  // Filter States
  const [timeFilter, setTimeFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAuthLogs, setShowAuthLogs] = useState(false);

  const ITEMS_PER_PAGE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  // Dropdown Options
  const timeOptions = [
    { value: 'ALL', label: 'Tüm Zamanlar' },
    { value: '1H', label: 'Son 1 Saat' },
    { value: '6H', label: 'Son 6 Saat' },
    { value: '12H', label: 'Son 12 Saat' },
    { value: '24H', label: 'Son 24 Saat' },
    { value: '3D', label: 'Son 3 Gün' },
    { value: '7D', label: 'Son 7 Gün' },
  ];

  const actionOptions = [
    { value: 'ALL', label: 'Tüm İşlemler' },
    { value: 'CREATE', label: 'Oluşturma (Create)' },
    { value: 'UPDATE', label: 'Güncelleme (Update)' },
    { value: 'DELETE', label: 'Silme (Delete)' },
  ];

  // Filtering Logic
  const filteredLogs = useMemo(() => {
    const now = new Date().getTime();

    return logs.filter(log => {
      // 1. Time Filter
      const logTime = new Date(log.timestamp).getTime();
      const diffMs = now - logTime;
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffHours / 24;

      let matchesTime = true;
      switch (timeFilter) {
        case '1H': matchesTime = diffHours <= 1; break;
        case '6H': matchesTime = diffHours <= 6; break;
        case '12H': matchesTime = diffHours <= 12; break;
        case '24H': matchesTime = diffHours <= 24; break;
        case '3D': matchesTime = diffDays <= 3; break;
        case '7D': matchesTime = diffDays <= 7; break;
        default: matchesTime = true;
      }

      // 2. Action Filter
      let matchesAction = true;
      if (actionFilter !== 'ALL') {
        matchesAction = log.action === actionFilter;
      }

      // 3. Text Search (Details or Entity)
      let matchesSearch = true;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        matchesSearch =
          log.details.toLowerCase().includes(term) ||
          log.entityType.toLowerCase().includes(term) ||
          (log.user && log.user.toLowerCase().includes(term));
      }

      // 4. Auth Filter
      let matchesAuth = true;
      if (!showAuthLogs && log.entityType === 'AUTH') {
        matchesAuth = false;
      }

      return matchesTime && matchesAction && matchesSearch && matchesAuth;
    });
  }, [logs, timeFilter, actionFilter, searchTerm, showAuthLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredLogs.length]);

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);

  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredLogs, currentPage]);

  const resetFilters = () => {
    setTimeFilter('ALL');
    setActionFilter('ALL');
    setSearchTerm('');
    setShowAuthLogs(false);
  };

  const actionLabels: Record<string, string> = {
    'CREATE': 'Oluşturma',
    'UPDATE': 'Güncelleme',
    'DELETE': 'Silme'
  };

  const getActionStyles = (action: string) => {
    switch (action) {
      case 'CREATE': return 'bg-green-100 text-green-800 border-green-200';
      case 'DELETE': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 px-2 sm:px-0">

      {/* Modal */}
      <AnimatePresence>
        {selectedLog && (
          <LogDetailsModal
            log={selectedLog}
            onClose={() => setSelectedLog(null)}
            onRollback={handleRollback}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className={`text-xl sm:text-2xl font-bold drop-shadow-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>İşlem Kayıtları</h1>
          <p className={`text-[11px] sm:text-sm ${isLight ? 'text-slate-500' : 'text-slate-200'}`}>Sistem üzerindeki tüm değişikliklerin denetim izleri.</p>
        </div>
        <div className="text-right hidden sm:block">
          <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-400">
            Toplam Kayıt: {logs.length}
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div ref={filterToolbarRef} className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col lg:flex-row gap-3 sm:gap-4">

        {/* Search */}
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Detay veya Kaynak ara..."
            className="block w-full pl-10 pr-3 py-2 border-2 border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 text-black font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-xs sm:text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center">
          {/* Auth Toggle */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <button
              onClick={() => setShowAuthLogs(!showAuthLogs)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${showAuthLogs ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${showAuthLogs ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
              />
            </button>
            <span className="text-xs sm:text-sm font-bold text-slate-700 whitespace-nowrap">Login Logları</span>
          </div>

          <div className="w-full sm:min-w-[180px]">
            <Dropdown
              options={timeOptions}
              value={timeFilter}
              onChange={setTimeFilter}
              icon={<Clock size={16} />}
              className="text-xs sm:text-sm"
            />
          </div>

          <div className="w-full sm:min-w-[180px]">
            <Dropdown
              options={actionOptions}
              value={actionFilter}
              onChange={setActionFilter}
              icon={<Tag size={16} />}
              className="text-xs sm:text-sm"
            />
          </div>

          {/* Reset Button */}
          {(timeFilter !== 'ALL' || actionFilter !== 'ALL' || searchTerm || showAuthLogs) && (
            <button
              onClick={resetFilters}
              className="flex items-center justify-center px-4 py-2 border-2 border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-[11px] sm:text-sm font-bold transition-colors w-full sm:w-auto"
            >
              <X className="w-4 h-4 mr-1" /> Temizle
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="bg-white rounded-xl border border-gray-300 shadow-sm p-12 flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
          <p className="text-slate-600 font-medium">Log kayıtları yükleniyor...</p>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="bg-white rounded-xl border border-red-300 shadow-sm p-12 flex flex-col items-center justify-center min-h-[400px]">
          <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button
            onClick={fetchLogs}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && logs.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-300 shadow-sm p-12 flex flex-col items-center justify-center min-h-[400px]">
          <Terminal className="w-12 h-12 text-slate-400 mb-4" />
          <p className="text-slate-600 font-medium">Henüz log kaydı bulunmuyor.</p>
        </div>
      )}

      {/* Logs Table */}
      {!isLoading && !error && logs.length > 0 && (
        <div ref={logsTableRef} className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden min-h-[400px]">

          {/* Desktop View (Table) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">Zaman</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">Kullanıcı</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">Kaynak</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">İşlem</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">Detaylar</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">Trace ID</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedLogs.length > 0 ? (
                  paginatedLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold font-mono">
                        {new Date(log.timestamp).toLocaleString('tr-TR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-slate-800 flex items-center gap-2">
                        <div className="p-1.5 bg-slate-200/50 rounded-full border border-slate-200">
                          <User className="w-3.5 h-3.5 text-slate-600" />
                        </div>
                        {log.user || 'Sistem'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900">
                        <span className="bg-gray-100 px-2 py-1 rounded border border-gray-200">{log.entityType}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-black uppercase tracking-wide rounded-md border shadow-sm ${getActionStyles(log.action)}`}>
                          {actionLabels[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-bold max-w-md truncate group-hover:text-indigo-700 transition-colors" title={log.details}>
                        {log.details}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono font-bold">
                        {log.traceId.slice(0, 8)}...
                      </td>
                    </tr>
                  ))
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Mobile View (Cards) */}
          <div className="lg:hidden divide-y divide-gray-200 bg-gray-50/50">
            {paginatedLogs.length > 0 ? (
              paginatedLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 bg-white space-y-3 active:bg-slate-50 border-b border-gray-100"
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border shadow-sm ${log.action === 'DELETE' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                        <Activity className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-gray-900">{log.entityType}</span>
                        <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3" />
                          {log.user || 'Sistem'}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wide rounded-md border ${getActionStyles(log.action)}`}>
                      {actionLabels[log.action] || log.action}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono font-bold pl-1">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(log.timestamp).toLocaleString('tr-TR')}
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-gray-200">
                    <p className="text-xs font-bold text-slate-800 leading-relaxed">{log.details}</p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 text-[9px] text-gray-400 font-mono">
                      <Terminal className="w-3 h-3" />
                      {log.traceId.slice(0, 12)}...
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
              ))
            ) : null}
          </div>

          {filteredLogs.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-400">
              <Filter className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-bold text-black text-sm">Seçilen kriterlere uygun kayıt bulunamadı.</p>
              <button onClick={resetFilters} className="text-indigo-600 text-[11px] sm:text-sm mt-2 font-bold hover:underline">Filtreleri Temizle</button>
            </div>
          )}

          {filteredLogs.length > 0 && (
            <div className="bg-gray-50 px-4 sm:px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-[10px] sm:text-xs text-gray-500 font-bold w-full sm:w-auto text-center sm:text-left">
                <span className="text-black">Toplam {filteredLogs.length} kayıt</span>
                <span className="mx-2 text-gray-300">|</span>
                Sayfa {currentPage} / {totalPages || 1}
              </div>

              <div className="flex justify-center items-center gap-1 w-full sm:w-auto">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 sm:p-2 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors"
                  title="Önceki Sayfa"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-[10px] sm:text-xs font-bold transition-all ${currentPage === page
                              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                            }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (
                      page === currentPage - 2 ||
                      page === currentPage + 2
                    ) {
                      return <span key={page} className="text-gray-400 px-0.5" >...</span>;
                    }
                    return null;
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 sm:p-2 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors"
                  title="Sonraki Sayfa"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="hidden sm:block text-[10px] sm:text-xs text-gray-500 font-bold text-right pt-2 sm:pt-0 w-full sm:w-auto">
                Sunucu zamanı: {new Date().toLocaleTimeString('tr-TR')}
              </div>
            </div>
          )}
        </div>
      )}
      {/* End of Logs Table */}

      {/* Interactive Tutorial System via Portal */}
      {showHelp && createPortal(
        <div className="fixed inset-0 z-[10000] pointer-events-auto isolate">
          {/* Dynamic Highlighter Box */}
          {targetRect && (
            <div
              className="fixed z-[10001] pointer-events-none rounded-xl"
              style={{
                top: targetRect.top - 4,
                left: targetRect.left - 4,
                width: targetRect.width + 8,
                height: targetRect.height + 8,
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.65)' // Cutout effect
              }}
            >
              {/* Border Ring */}
              <div className={`absolute inset-0 rounded-xl border-[3px] animate-pulse ${helpSlide === 0 ? 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.5)]' :
                'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
                }`}></div>
            </div>
          )}

          {/* Tutorial Cards */}
          {targetRect && (
            <div
              className={`fixed z-[10002] bg-white rounded-2xl shadow-2xl p-5 max-w-sm border-2 animate-in fade-in zoom-in-95 duration-300 ${helpSlide === 0 ? 'border-amber-500' : 'border-indigo-500'}`}
              style={{
                top: Math.min(window.innerHeight - 250, targetRect.bottom + 16),
                left: Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 192), window.innerWidth - 400)
              }}
            >
              {/* Arrow */}
              <div
                className={`absolute -top-2 w-4 h-4 bg-white border-t-2 border-l-2 transform rotate-45 ${helpSlide === 0 ? 'border-amber-500' : 'border-indigo-500'}`}
                style={{
                  left: Math.min(Math.max(20, (targetRect.left - Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 192), window.innerWidth - 400)) + (targetRect.width / 2) - 8), 340)
                }}
              ></div>

              {helpSlide === 0 && (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                      <Filter className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">Filtreleme ve Arama</h3>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Log kayıtlarını detaylı bir şekilde filtreleyebilir, belirli bir tarih aralığı, işlem tipi veya kullanıcıya göre arama yapabilirsiniz. Login loglarını ayrıca açıp kapatabilirsiniz.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Atla</button>
                    <button onClick={() => setHelpSlide(1)} className="px-3 py-1.5 text-xs font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors shadow-lg shadow-amber-200">Sıradaki</button>
                  </div>
                </>
              )}

              {helpSlide === 1 && (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                      <Terminal className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">İşlem Geçmişi</h3>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Burada yapılan tüm işlemler listelenir. Kayıtların üzerine tıklayarak teknik detayları görebilir, uygun kayıtlar için <b>Geri Alma (Rollback)</b> işlemi yapabilirsiniz.
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
        title="Denetim Günlükleri Rehberi"
      >
        <Info className="w-7 h-7 group-hover:scale-110 transition-transform" />
      </button>
    </div>
  );
};
