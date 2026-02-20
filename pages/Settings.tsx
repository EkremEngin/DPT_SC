
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { Monitor, Moon, CheckCircle2, Zap, Sun, User, LogOut, Mail, Shield, Building, Eye, EyeOff, LayoutTemplate, Info, UserPlus, Trash2, Users, AlertTriangle, X, Lock, KeyRound } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { UserManagerModal } from '../components/UserManagerModal';
import { api } from '../services/api';

export const Settings: React.FC = () => {
  const { backgroundMode, setBackgroundMode, isPresentationMode, setPresentationMode } = useTheme();
  const { user, logout } = useAuth();

  // Enforce Privacy Mode for VIEWERS
  React.useEffect(() => {
    if (user?.role === 'VIEWER' && !isPresentationMode) {
      setPresentationMode(true);
    }
  }, [user, isPresentationMode, setPresentationMode]);

  const isLight = backgroundMode === 'LIGHT';

  // State
  const [showHelp, setShowHelp] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [helpSlide, setHelpSlide] = useState(0);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showUserListModal, setShowUserListModal] = useState(false);
  const [userList, setUserList] = useState<any[]>([]);
  const [userListLoading, setUserListLoading] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Tutorial Refs
  const appearanceCardRef = useRef<HTMLDivElement>(null);
  const presentationCardRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Update tutorial highlight position
  useEffect(() => {
    let animationFrameId: number;

    const updateRect = () => {
      let target = null;
      if (helpSlide === 0) target = appearanceCardRef.current;
      else if (helpSlide === 1) target = presentationCardRef.current;

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

  const navigate = useNavigate();

  const handleLogout = () => {
    if (confirm('Oturumu kapatmak istediğinize emin misiniz?')) {
      logout();
      navigate('/login');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    // Validation
    if (passwordData.newPassword.length < 6) {
      setPasswordError('Yeni şifre en az 6 karakter olmalıdır');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Yeni şifre ve onayı eşleşmiyor');
      return;
    }

    try {
      await api.updateProfile({
        currentPassword: passwordData.currentPassword || undefined,
        newPassword: passwordData.newPassword
      });
      setPasswordSuccess(true);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setShowPasswordForm(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (error: any) {
      setPasswordError(error.message || 'Şifre değiştirilemedi');
    }
  };

  const canManageUsers = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 pt-4 animate-in fade-in duration-500">
      <UserManagerModal isOpen={showUserModal} onClose={() => setShowUserModal(false)} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
        <div>
          <h1 className={`text-2xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>Ayarlar</h1>
          <p className={`text-sm font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Sistem tercihlerinizi kişiselleştirin.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-white/10 border-white/10 backdrop-blur-sm'}`}>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className={`text-xs font-bold ${isLight ? 'text-slate-600' : 'text-white'}`}>Sistem: Aktif</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Appearance Card */}
        <div ref={appearanceCardRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
          <div className="p-6 border-b border-gray-50 bg-gray-50/50">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                <Monitor className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Görünüm</h2>
            </div>
            <p className="text-xs text-gray-500 pl-[44px]">Arayüz temasını seçin.</p>
          </div>
          <div className="p-6 grid grid-cols-3 gap-3">
            {[
              { id: 'AURORA', label: 'Canlı', icon: Zap, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { id: 'DARK', label: 'Koyu', icon: Moon, color: 'text-slate-700', bg: 'bg-slate-100' },
              { id: 'LIGHT', label: 'Açık', icon: Sun, color: 'text-amber-500', bg: 'bg-amber-50' }
            ].map((theme) => (
              <button
                key={theme.id}
                onClick={() => setBackgroundMode(theme.id as any)}
                className={`
                            relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all
                            ${backgroundMode === theme.id
                    ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-500/20'
                    : 'border-gray-100 hover:border-indigo-200 hover:bg-gray-50'
                  }
                        `}
              >
                <theme.icon className={`w-6 h-6 mb-2 ${theme.color}`} />
                <span className="text-xs font-bold text-gray-700">{theme.label}</span>
                {backgroundMode === theme.id && (
                  <div className="absolute top-1.5 right-1.5 text-indigo-600">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Presentation Mode Card (New) */}
        <div ref={presentationCardRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
          <div className="p-6 border-b border-gray-50 bg-gray-50/50">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                <LayoutTemplate className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Sunum Modu</h2>
            </div>
            <p className="text-xs text-gray-500 pl-[44px]">Hassas verileri gizleyin.</p>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg transition-colors ${isPresentationMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-200 text-gray-500'}`}>
                  {isPresentationMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Veri Gizliliği</h3>
                  <p className="text-[10px] text-gray-500 font-medium">Tüm parasal değerleri (****) olarak maskeler.</p>
                </div>
              </div>
              <button
                onClick={() => user?.role !== 'VIEWER' && setPresentationMode(!isPresentationMode)}
                disabled={user?.role === 'VIEWER'}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isPresentationMode ? 'bg-indigo-600' : 'bg-gray-300'} ${user?.role === 'VIEWER' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${isPresentationMode ? 'left-7' : 'left-1'}`}></div>
              </button>
            </div>
            {user?.role === 'VIEWER' && (
              <p className="text-[10px] text-amber-600 mt-2 font-medium flex items-center gap-1">
                <Shield className="w-3 h-3" />
                İzleyici hesaplarında veri gizliliği zorunludur.
              </p>
            )}
          </div>
        </div>

        {/* Profile Summary */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300 md:col-span-2">
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-500/20">
                {user?.username?.substring(0, 2).toUpperCase() || 'TR'}
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">{user?.username || 'Misafir Kullanıcı'}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold">{user?.role || 'VIEWER'}</span>
                  <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                  <span className="text-emerald-600 font-bold">Online</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Button moved to bottom section */}
              <Button variant="danger" onClick={handleLogout} className="flex-1 sm:flex-none text-xs py-2 px-4 shadow-none">
                <LogOut className="w-3.5 h-3.5 mr-2" /> Çıkış Yap
              </Button>
            </div>
          </div>
        </div>

        {/* User Management Section (New) */}
        {canManageUsers && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300 md:col-span-2">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Kullanıcı Yönetimi</h2>
              </div>
              <p className="text-xs text-gray-500 pl-[44px]">Sisteme yeni kullanıcılar ekleyin veya mevcut kullanıcıları yönetin.</p>
            </div>
            <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Yeni Kullanıcı Ekle</h3>
                <p className="text-xs text-gray-500 mt-1">Sisteme erişebilecek yeni bir yönetici veya izleyici tanımlayın.</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={async () => {
                    setShowUserListModal(true);
                    setUserListLoading(true);
                    setDeleteError('');
                    try {
                      const users = await api.getUsers();
                      setUserList(users);
                    } catch (e: any) {
                      setDeleteError(e.message || 'Kullanıcılar yüklenemedi');
                    } finally {
                      setUserListLoading(false);
                    }
                  }}
                  className="px-5 py-3 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold rounded-xl transition-all border-2 border-red-200 hover:border-red-300 flex items-center gap-2 flex-1 sm:flex-none justify-center"
                >
                  <Users className="w-4 h-4" />
                  Hesapları Yönet
                </button>
                <button
                  onClick={() => setShowUserModal(true)}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5 flex items-center gap-2 flex-1 sm:flex-none justify-center"
                >
                  <UserPlus className="w-4 h-4" />
                  Kullanıcı Oluştur
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* User List / Delete Modal */}
      {showUserListModal && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowUserListModal(false); setDeletingUserId(null); setConfirmText(''); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Kayıtlı Hesaplar</h2>
                  <p className="text-[10px] text-gray-500 font-medium">Hesapları görüntüleyin veya kalıcı olarak silin.</p>
                </div>
              </div>
              <button onClick={() => { setShowUserListModal(false); setDeletingUserId(null); setConfirmText(''); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {userListLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
              ) : deleteError && userList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-red-500">
                  <AlertTriangle className="w-8 h-8 mb-2" />
                  <p className="text-sm font-bold">{deleteError}</p>
                </div>
              ) : userList.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm font-medium">Kayıtlı hesap bulunamadı.</div>
              ) : (
                userList.map((u) => (
                  <div key={u.id} className={`p-4 rounded-xl border transition-all duration-200 ${deletingUserId === u.id ? 'border-red-300 bg-red-50/50 shadow-md' : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                    }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0">
                          {u.username?.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 truncate">{u.username}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${u.role === 'ADMIN' ? 'bg-amber-100 text-amber-700' :
                                u.role === 'MANAGER' ? 'bg-indigo-100 text-indigo-700' :
                                  'bg-gray-100 text-gray-600'
                              }`}>{u.role}</span>
                            {u.id === user?.id && <span className="text-[10px] font-bold text-emerald-600">(Sen)</span>}
                          </div>
                          <p className="text-[11px] text-gray-400 font-medium truncate">{u.email || 'E-posta yok'}</p>
                        </div>
                      </div>
                      {u.id !== user?.id && (
                        deletingUserId === u.id ? (
                          <button
                            onClick={() => { setDeletingUserId(null); setConfirmText(''); setDeleteError(''); }}
                            className="text-[10px] font-bold text-gray-500 hover:text-gray-700 px-2 py-1 shrink-0"
                          >
                            İptal
                          </button>
                        ) : (
                          <button
                            onClick={() => { setDeletingUserId(u.id); setConfirmText(''); setDeleteError(''); }}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all shrink-0"
                            title="Hesabı Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>

                    {/* Confirmation Area */}
                    {deletingUserId === u.id && (
                      <div className="mt-3 pt-3 border-t border-red-200">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                          <p className="text-[11px] text-red-600 font-bold">
                            <b>{u.username}</b> hesabını kalıcı olarak silmek için aşağıya <b>ONAYLIYORUM</b> yazın.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder="ONAYLIYORUM"
                            className="flex-1 px-3 py-2 text-xs font-bold border-2 border-red-200 rounded-lg outline-none focus:border-red-400 text-gray-900 placeholder:text-red-200"
                            autoFocus
                          />
                          <button
                            disabled={confirmText !== 'ONAYLIYORUM'}
                            onClick={async () => {
                              try {
                                setDeleteError('');
                                await api.deleteUser(u.id);
                                setUserList(prev => prev.filter(x => x.id !== u.id));
                                setDeletingUserId(null);
                                setConfirmText('');
                              } catch (e: any) {
                                setDeleteError(e.message || 'Silme başarısız');
                              }
                            }}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 ${confirmText === 'ONAYLIYORUM'
                                ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              }`}
                          >
                            Sil
                          </button>
                        </div>
                        {deleteError && (
                          <p className="text-[10px] text-red-500 font-bold mt-2">{deleteError}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <p className="text-[10px] text-gray-400 text-center font-medium">Toplam {userList.length} kayıtlı hesap</p>
            </div>
          </div>
        </div>,
        document.body
      )}

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
              <div className={`absolute inset-0 rounded-2xl border-[3px] animate-pulse ${helpSlide === 0 ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)]' :
                'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.5)]'
                }`}></div>
            </div>
          )}

          {/* Tutorial Cards */}
          {targetRect && (
            <div
              className={`fixed z-[10002] bg-white rounded-2xl shadow-2xl p-5 max-w-sm border-2 animate-in fade-in zoom-in-95 duration-300 ${helpSlide === 0 ? 'border-indigo-500' : 'border-rose-500'}`}
              style={{
                top: Math.min(window.innerHeight - 250, targetRect.bottom + 16),
                left: Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 192), window.innerWidth - 400)
              }}
            >
              {/* Arrow */}
              <div
                className={`absolute -top-2 w-4 h-4 bg-white border-t-2 border-l-2 transform rotate-45 ${helpSlide === 0 ? 'border-indigo-500' : 'border-rose-500'}`}
                style={{
                  left: Math.min(Math.max(20, (targetRect.left - Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 192), window.innerWidth - 400)) + (targetRect.width / 2) - 8), 340)
                }}
              ></div>

              {helpSlide === 0 && (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                      <Monitor className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">Görünüm Ayarları</h3>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Arayüz temasını (Canlı, Koyu, Açık) buradan kişiselleştirebilir, çalışma ortamınıza en uygun görünümü seçebilirsiniz.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Atla</button>
                    <button onClick={() => setHelpSlide(1)} className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">Sıradaki</button>
                  </div>
                </>
              )}

              {helpSlide === 1 && (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-rose-100 rounded-lg shrink-0">
                      <EyeOff className="w-5 h-5 text-rose-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">Sunum Modu</h3>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Toplantılarda veya ekran paylaşımı sırasında hassas finansal verileri gizlemek için bu modu kullanabilirsiniz.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Kapat</button>
                    <button onClick={() => { setShowHelp(false); setHelpSlide(0); }} className="px-3 py-1.5 text-xs font-bold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200">Tamamla</button>
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
        title="Ayarlar Rehberi"
      >
        <Info className="w-7 h-7 group-hover:scale-110 transition-transform" />
      </button>
    </div>
  );
};

