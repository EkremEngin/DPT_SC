import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Building2, ShieldCheck, Activity, Settings, User, HelpCircle, X, Layers, Layout as LayoutIcon, CreditCard, BarChart3, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from './Logo';
import Dock from './Dock';
import Aurora from './Aurora';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import GlassSurface from './GlassSurface';
import Carousel, { CarouselItem } from './Carousel';
import VerticalDock from './VerticalDock';

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { backgroundMode } = useTheme();
  const { user } = useAuth();
  const [showHelp, setShowHelp] = useState(false);

  const isLight = backgroundMode === 'LIGHT';

  // Base icon size for standard view
  const baseIconSize = 14;
  const strokeWidth = 2.5;

  const dockItems = [
    {
      icon: (
        <motion.div
          animate={location.pathname === '/' ? {
            scale: [1, 1.1, 1],
            transition: { repeat: Infinity, duration: 2, ease: "easeInOut" }
          } : {}}
        >
          <Activity size={baseIconSize} strokeWidth={strokeWidth} />
        </motion.div>
      ),
      label: 'Dashboard',
      onClick: () => navigate('/'),
      isActive: location.pathname === '/'
    },
    {
      icon: <Building2 size={baseIconSize} strokeWidth={strokeWidth} />,
      label: 'Bina Yönetimi',
      onClick: () => navigate('/structure'),
      isActive: location.pathname === '/structure'
    },
    {
      icon: <FileText size={baseIconSize} strokeWidth={strokeWidth} />,
      label: 'Sözleşme Yönetimi',
      onClick: () => navigate('/leasing'),
      isActive: location.pathname === '/leasing'
    },
    {
      icon: <ShieldCheck size={baseIconSize} strokeWidth={strokeWidth} />,
      label: 'Denetim Kayıtları',
      onClick: () => navigate('/audit'),
      isActive: location.pathname === '/audit'
    },
    {
      icon: <Settings size={baseIconSize} strokeWidth={strokeWidth} />,
      label: 'Ayarlar',
      onClick: () => navigate('/settings'),
      isActive: location.pathname === '/settings'
    },
  ];

  /* --- Help Content Logic --- */
  const getHelpItems = (): CarouselItem[] => {
    const path = location.pathname;

    // Dashboard Help
    if (path === '/') {
      return [
        {
          id: 1,
          title: "Genel Bakış",
          description: "Dashboard ekranı, tüm kampüslerinizin anlık doluluk oranlarını ve finansal özetlerini tek bir noktadan izlemenizi sağlar.",
          icon: <Activity className="w-8 h-8 text-indigo-500" />
        },
        {
          id: 2,
          title: "Doluluk Grafikleri",
          description: "Kampüs bazlı doluluk oranlarını pasta grafiklerle görselleştirin ve boş alan kapasitesini anında görün.",
          icon: <BarChart3 className="w-8 h-8 text-emerald-500" />
        },
        {
          id: 3,
          title: "Gelir Takibi",
          description: "Toplam tahmini aylık gelirinizi ve kampüs bazlı gelir dağılımını takip edin.",
          icon: <CreditCard className="w-8 h-8 text-blue-500" />
        }
      ];
    }

    // Structure Management Help
    if (path === '/structure') {
      return [
        {
          id: 1,
          title: "Bina & Kat Yönetimi",
          description: "Kampüsler, binalar ve katlar arasında hiyerarşik olarak gezinin ve fiziksel yapıyı yönetin.",
          icon: <Building2 className="w-8 h-8 text-indigo-500" />
        },
        {
          id: 2,
          title: "Ofis Tahsisi",
          description: "Kat planları üzerinden ofisleri görüntüleyin, boş/dolu durumlarını kontrol edin ve yeni firma atamaları yapın.",
          icon: <LayoutIcon className="w-8 h-8 text-orange-500" />
        },
        {
          id: 3,
          title: "Kapasite Kontrolü",
          description: "Her katın metrekare kapasitesini ve mevcut doluluk durumunu anlık olarak izleyin.",
          icon: <Layers className="w-8 h-8 text-rose-500" />
        }
      ];
    }

    // Leasing Management Help
    if (path === '/leasing') {
      return [
        {
          id: 1,
          title: "Sözleşme Listesi",
          description: "Tüm aktif ve pasif kira sözleşmelerini listeleyin, filtreleyin ve detaylarına ulaşın.",
          icon: <FileText className="w-8 h-8 text-indigo-500" />
        },
        {
          id: 2,
          title: "Yeni Sözleşme",
          description: "Yeni firma kayıtları oluşturun ve kira şartlarını belirleyerek sisteme ekleyin.",
          icon: <Database className="w-8 h-8 text-emerald-500" />
        },
        {
          id: 3,
          title: "Finansal Detaylar",
          description: "Kira bedelleri, işletme ücretleri ve sözleşme tarihleri gibi kritik finansal verileri yönetin.",
          icon: <CreditCard className="w-8 h-8 text-violet-500" />
        }
      ];
    }

    // Default Help
    return [
      {
        id: 1,
        title: "Sistem Kullanımı",
        description: "Sol alt köşedeki menüden modüller arasında geçiş yapabilirsiniz.",
        icon: <LayoutIcon className="w-8 h-8 text-gray-500" />
      },
      {
        id: 2,
        title: "Ayarlar",
        description: "Temayı değiştirmek ve sistem genel ayarlarını yapılandırmak için Ayarlar modülünü kullanın.",
        icon: <Settings className="w-8 h-8 text-gray-500" />
      }
    ];
  };

  return (
    <div className={`flex flex-col h-screen overflow-hidden relative transition-colors duration-500 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>

      {backgroundMode === 'AURORA' && (
        <Aurora
          colorStops={['#ff6666', '#5227FF', '#0291d9']}
          speed={0.5}
          amplitude={1.2}
        />
      )}

      {backgroundMode === 'DARK' && (
        <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 z-0 pointer-events-none" />
      )}

      {backgroundMode === 'LIGHT' && (
        <div className="fixed inset-0 bg-slate-50 z-0 pointer-events-none" />
      )}

      <header className="flex-shrink-0 z-50 sticky top-1 sm:top-2 px-2 sm:px-6 mb-1 sm:mb-2">
        <GlassSurface
          borderRadius={35}
          blur={20}
          displace={15}
          backgroundOpacity={0.3}
          opacity={0.2}
          saturation={1.2}
          distortionScale={25}
          borderWidth={1.5}
          mixBlendMode="normal"
          className="w-full flex items-center justify-between px-3 sm:px-6 py-1.5 sm:py-2 shadow-2xl border border-white/20 bg-white/5"
        >
          <div className="flex items-center gap-4 w-full justify-between">
            <div className="flex items-center gap-2 sm:gap-4 overflow-hidden min-w-[100px] sm:min-w-[140px]">
              <div className="w-[100px] sm:w-[140px] drop-shadow-md shrink-0 cursor-pointer" onClick={() => navigate('/')}>
                <Logo className={isLight ? 'text-slate-900' : 'text-white'} />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="text-right hidden sm:block">
                <p className={`text-[10px] sm:text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{user?.username || 'Misafir'}</p>
                <p className={`text-[9px] sm:text-[10px] opacity-70 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>{user?.role || 'VIEWER'}</p>
              </div>
              <div className={`p-1.5 sm:p-2 rounded-full border cursor-pointer hover:bg-white/10 transition-colors ${isLight ? 'border-slate-200 bg-white/50' : 'border-white/10 bg-white/5'}`} onClick={() => navigate('/settings')}>
                <User className={`w-3.5 h-3.5 sm:w-4 h-4 ${isLight ? 'text-slate-600' : 'text-slate-300'}`} />
              </div>
            </div>
          </div>
        </GlassSurface>
      </header>

      {/* Vertical Navigation Dock - Placed at Top-Left */}
      <div className="fixed left-4 top-24 z-[100] hidden md:block">
        <VerticalDock
          panelHeight={60}
          magnification={70}
          baseItemSize={40}
          distance={150}
          items={dockItems}
        />
      </div>

      {/* Mobile Navigation Dock - Centered at Bottom */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] md:hidden">
        <Dock
          panelHeight={48}
          magnification={54}
          baseItemSize={34}
          distance={100}
          items={dockItems}
        />
      </div>



      <main className="flex-1 overflow-y-auto scroll-smooth relative z-10 pt-1 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto pb-24 md:pb-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
