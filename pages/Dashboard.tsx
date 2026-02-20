import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Sector, Label
} from 'recharts';
import {
  Building2, Maximize2, Percent, TrendingUp, MapPin, ChevronDown, Calendar as CalendarIcon, X, Info, Loader2, AlertCircle
} from 'lucide-react';

import { api } from '../services/api';
import CountUp from '../components/CountUp';
import { useTheme } from '../contexts/ThemeContext';
import { Dropdown } from '../components/Dropdown';
import { listenForDataChanges } from '../utils/events';

// Helper for "4+ digits" animation requirement
const SplitCountUp = ({ value, className, duration = 1 }: { value: number, className?: string, duration?: number }) => {
  // Refactored to animate ONLY the decimal part (decimals), keeping integer part static.
  // Example: 37.573,99 -> "37.573" (static) "," "99" (animated)

  const integerPart = Math.floor(value);
  // Get decimals as integer (0-99)
  const decimalPart = Math.round((value - integerPart) * 100);

  return (
    <span className={className}>
      {integerPart.toLocaleString('tr-TR')}
      ,
      <CountUp
        to={decimalPart}
        minimumIntegerDigits={2}
        decimals={0} // We are animating an integer (0-99) representing the fraction
        duration={duration}
      />
    </span>
  );
};

// --- Modern Premium Active Shape ---
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;

  // Word wrapping logic
  const words = payload.name.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    if (currentLine.length + 1 + words[i].length <= 20) { // Max 20 chars per line
      currentLine += ' ' + words[i];
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);

  // Limit to 3 lines max to prevent overflow
  const displayLines = lines.slice(0, 3);

  return (
    <g>
      {/* Outer glow ring */}
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 12}
        fill={fill}
        opacity={0.15}
        cornerRadius={12}
      />
      {/* Main expanded sector */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 2}
        outerRadius={outerRadius + 4}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={6}
        style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
      />

      {/* Name - Moved to right side with connecting line/dot */}
      <g>
        {/* Dynamic height bar based on line count */}
        <rect
          x={cx + outerRadius + 15}
          y={cy - (displayLines.length * 8)}
          width="4"
          height={displayLines.length * 16}
          rx="2"
          fill={fill}
          opacity={0.8}
        />
        <text x={cx + outerRadius + 26} y={cy} dy={displayLines.length === 1 ? 5 : -(displayLines.length * 6) + 6} textAnchor="start" fill="#1e293b" style={{ fontSize: '13px', fontFamily: 'Inter, system-ui', fontWeight: '600' }}>
          {displayLines.map((line, i) => (
            <tspan x={cx + outerRadius + 26} dy={i === 0 ? 0 : 16} key={i}>{line}</tspan>
          ))}
        </text>
      </g>

      {/* Center Info - Only Percent and Count */}
      <text x={cx} y={cy} dy={-2} textAnchor="middle" dominantBaseline="central" fill={fill} style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'Inter, system-ui' }}>
        {`%${(percent * 100).toFixed(1)}`}
      </text>
      <text x={cx} y={cy} dy={20} textAnchor="middle" dominantBaseline="central" fill="#94a3b8" style={{ fontSize: '11px', fontFamily: 'Inter, system-ui', fontWeight: '600' }}>
        {value} Firma
      </text>
    </g>
  );
};

// --- Modern Center Label ---
const CustomCenterLabel = ({ viewBox, hasActiveIndex, totalCompanies, totalSectors }: any) => {
  const { cx, cy } = viewBox || {};
  if (hasActiveIndex || !cx || !cy) return null;

  return (
    <g>
      <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle" fill="#0f172a" style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'Inter, system-ui', letterSpacing: '-0.025em' }}>
        {totalCompanies}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" style={{ fontSize: '10px', fontWeight: '700', fontFamily: 'Inter, system-ui', letterSpacing: '0.08em', textTransform: 'uppercase' } as any}>
        TOPLAM FİRMA
      </text>
    </g>
  );
};

import { ContractCalendar } from '../components/ContractCalendar';

import { formatCurrency } from '../utils/format';

export const Dashboard: React.FC = () => {
  const { backgroundMode, isPresentationMode } = useTheme();
  const isLight = backgroundMode === 'LIGHT';

  const [selectedCampusId, setSelectedCampusId] = useState<string>('ALL');
  const [expandedCampusId, setExpandedCampusId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
  const [expandedChart, setExpandedChart] = useState<'SECTOR' | 'TAG' | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpSlide, setHelpSlide] = useState(0);
  
  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0); // For triggering re-renders on polling

  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tutorial Refs
  const sectorChartRef = useRef<HTMLDivElement>(null);
  const tagChartRef = useRef<HTMLDivElement>(null);
  const campusGridRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Update tutorial highlight position
  useEffect(() => {
    const updateRect = () => {
      let target = null;
      if (helpSlide === 0) target = sectorChartRef.current;
      else if (helpSlide === 1) target = tagChartRef.current;
      else if (helpSlide === 2) target = campusGridRef.current;
      else if (helpSlide === 3) target = calendarRef.current;

      if (target && showHelp) {
        const rect = target.getBoundingClientRect();
        // Check if visible
        if (rect.width > 0 && rect.height > 0) {
          setTargetRect(rect);
        }
      }
    };

    if (showHelp) {
      updateRect();
      // Small delay to ensure layout is stable
      setTimeout(updateRect, 100);

      // Animation frame for smooth updates
      let animationFrameId: number;
      const smoothUpdate = () => {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(updateRect);
      };

      window.addEventListener('resize', smoothUpdate);
      window.addEventListener('scroll', smoothUpdate, true);

      return () => {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', smoothUpdate);
        window.removeEventListener('scroll', smoothUpdate, true);
      };
    }
  }, [helpSlide, showHelp, expandedChart]);

  // --- Live Updates via Polling ---
  useEffect(() => {
    // Initial fetch
    fetchData();
    
    // Set up polling every 30 seconds
    pollingIntervalRef.current = setInterval(() => {
      fetchData();
    }, 30000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // --- Event-based Refresh from Other Pages ---
  useEffect(() => {
    // Listen for data changes from other pages (Leasing Management, Physical Structure, etc.)
    const unsubscribe = listenForDataChanges((data) => {
      console.log('Dashboard: Data change detected', data);
      // Trigger immediate refresh when data changes
      fetchData();
    });

    return unsubscribe;
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      // Just trigger version update - actual data fetching happens in useMemo
      setDataVersion(v => v + 1);
      if (isLoading) setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken hata oluştu');
      if (isLoading) setIsLoading(false);
    }
  };
  // -----------------------

  // Fetch all leases for the calendar
  const [allLeases, setAllLeases] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({
    totalArea: 0,
    usedArea: 0,
    emptyArea: 0,
    occupancyRate: 0,
    totalRevenue: 0,
    sectorData: [],
    campusData: [],
    totalCompanies: 0
  });

  // Fetch data when version changes
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [leasesData, campusesData, metricsData] = await Promise.all([
          api.getAllLeaseDetails(),
          api.getCampuses(),
          api.getDashboardMetrics(selectedCampusId === 'ALL' ? undefined : selectedCampusId)
        ]);
        setAllLeases(leasesData || []);
        setCampuses(campusesData || []);
        setMetrics(metricsData || {
          totalArea: 0,
          usedArea: 0,
          emptyArea: 0,
          occupancyRate: 0,
          totalRevenue: 0,
          sectorData: [],
          campusData: [],
          totalCompanies: 0
        });
        setError(null);
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        setError(err.message || 'Veriler yüklenirken hata oluştu');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAllData();
  }, [dataVersion, selectedCampusId]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const campusOptions = useMemo(() => {
    return [
      { value: 'ALL', label: 'Tüm Kampüsler' },
      ...campuses.map(c => ({ value: c.id, label: c.name }))
    ];
  }, [campuses]);

  // Calculate Business Tag Data (Full for Modal)
  const allTagData = useMemo(() => {
    const tagCounts: Record<string, number> = {};

    const leasesToUse = selectedCampusId === 'ALL'
      ? allLeases
      : allLeases.filter(l => l.campus.id === selectedCampusId);

    leasesToUse.forEach(l => {
      if (l.company.businessAreas) {
        l.company.businessAreas.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    return Object.entries(tagCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [allLeases, selectedCampusId]);

  // Sliced for Widget
  const tagData = useMemo(() => allTagData.slice(0, 10), [allTagData]);

  const onPieEnter = useCallback((_: any, index: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveIndex(index);
  }, []);

  const onPieLeave = useCallback(() => {
    timerRef.current = setTimeout(() => setActiveIndex(null), 1000);
  }, []);

  const onTagEnter = useCallback((_: any, index: number) => {
    setActiveTagIndex(index);
  }, []);

  const onTagLeave = useCallback(() => {
    setActiveTagIndex(null);
  }, []);

  const activeSectorName = activeIndex !== null && metrics.sectorData[activeIndex]
    ? metrics.sectorData[activeIndex].name
    : null;

  const activeTagName = activeTagIndex !== null && tagData[activeTagIndex]
    ? tagData[activeTagIndex].name
    : null;

  const COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#14b8a6', '#06b6d4', '#3b82f6', '#10b981'];

  const handlePieClick = (data: any) => {
    navigate('/leasing', { state: { filterSector: data.name } });
  };

  const handleTagClick = (data: any) => {
    navigate('/leasing', { state: { selectedBusinessTags: [data.name] } });
  };

  const getOccupancyColor = (rate: number) => {
    if (rate >= 80) return { bar: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', label: 'Çok Yoğun' };
    if (rate >= 50) return { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', label: 'Orta' };
    return { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Müsait' };
  };

  const toggleExpand = (id: string) => setExpandedCampusId(prev => prev === id ? null : id);

  const stats = [
    { title: 'Toplam Alan', renderValue: <><SplitCountUp value={metrics.totalArea} duration={1} /> m²</>, icon: Maximize2, color: 'text-blue-600', bg: 'bg-blue-100' },
    { title: 'Dolu Alan', renderValue: <><SplitCountUp value={metrics.usedArea} duration={1} /> m²</>, icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { title: 'Aylık Ciro', renderValue: isPresentationMode ? '**** TL' : <><SplitCountUp value={metrics.totalRevenue} duration={1} /> TL</>, icon: TrendingUp, color: 'text-emerald-700', bg: 'bg-emerald-100' },
    { title: 'Doluluk %', renderValue: <>%<CountUp to={Number(metrics.occupancyRate.toFixed(1))} duration={1} /></>, icon: Percent, color: 'text-violet-600', bg: 'bg-violet-100' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] gap-3 w-full animate-in fade-in duration-500 overflow-hidden box-border">

      {/* Header & Filter - Compact */}
      <div className="flex items-center justify-between shrink-0 px-1 pt-1">
        <div>
          <h1 className={`text-xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Teknokent Dashboard</h1>
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>
            {selectedCampusId === 'ALL' ? 'Genel Performans Özeti' : 'Kampüs Detayı'}
          </p>
        </div>
        <div className="w-56">
          <Dropdown
            options={campusOptions}
            value={selectedCampusId}
            onChange={setSelectedCampusId}
            icon={<MapPin size={16} />}
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
            <p className={`font-medium ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Dashboard yükleniyor...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <p className="font-medium text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchData}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
            >
              Tekrar Dene
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!isLoading && !error && (
      <>
      {/* Campus Details Grid (Row 1 - Compact) */}
      <div ref={campusGridRef} className="grid grid-cols-3 gap-3 shrink-0 h-auto">
        {metrics.campusData.map(campus => {
          const colorTheme = getOccupancyColor(campus.occupancyRate);
          const isExpanded = expandedCampusId === campus.id;
          const avgRevenue = campus.usedArea > 0 ? campus.revenue / campus.usedArea : 0;

          return (
            <div
              key={campus.id}
              onClick={() => toggleExpand(campus.id)}
              className={`
                bg-white rounded-xl border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between
                ${isExpanded ? 'border-indigo-400 ring-1 ring-indigo-400' : 'border-gray-200'}
              `}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0 pr-2">
                  <h4 className="font-bold text-gray-800 text-sm truncate">{campus.name}</h4>
                  <div className="flex items-center gap-1 text-[10px] text-gray-500">
                    <span>{isExpanded ? 'Gizle' : 'Detay'}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>
                <div className={`text-right ${colorTheme.text}`}>
                  <span className="text-lg font-bold block leading-none">
                    %<CountUp to={Number(campus.occupancyRate.toFixed(0))} duration={1} />
                  </span>
                  <span className="text-[9px] font-bold opacity-80">{colorTheme.label}</span>
                </div>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full transition-all duration-1000 ${colorTheme.bar}`}
                  style={{ width: `${campus.occupancyRate}%` }}
                />
              </div>

              {/* Expanded Content - Overlay or pushed? Keeping it pushed but compact */}
              {isExpanded && (
                <div className="grid grid-cols-4 gap-1 mt-2 pt-2 border-t border-gray-100 animate-in slide-in-from-top-1">
                  <div className="bg-slate-50 p-1.5 rounded text-center">
                    <div className="text-slate-700 text-[10px] font-bold">{campus.totalArea.toLocaleString('tr-TR')}</div>
                    <div className="text-[8px] text-slate-400">Toplam m²</div>
                  </div>
                  <div className="bg-indigo-50 p-1.5 rounded text-center">
                    <div className="text-indigo-700 text-[10px] font-bold">{campus.usedArea.toLocaleString('tr-TR')}</div>
                    <div className="text-[8px] text-indigo-400">Dolu m²</div>
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded text-center">
                    <div className="text-slate-600 text-[10px] font-bold">{campus.emptyArea.toLocaleString('tr-TR')}</div>
                    <div className="text-[8px] text-slate-400">Boş m²</div>
                  </div>
                  <div className="bg-emerald-50 p-1.5 rounded text-center">
                    {/* Formatted compact revenue */}
                    <div className="text-emerald-700 text-[10px] font-bold truncate">
                      {formatCurrency(Math.floor(avgRevenue), isPresentationMode)} TL
                    </div>
                    <div className="text-[8px] text-emerald-400">Ort. m² Başı Kira</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Main Content Area (Row 2 - Fills Height) */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3 pb-2">

        {/* KPIs Column (Left) */}
        <div className="col-span-2 flex flex-col gap-3 h-full overflow-y-auto pr-1">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center gap-1 hover:border-indigo-300 transition-all flex-1 min-h-[60px]">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-md ${stat.bg}`}>
                  <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                </div>
                <p className="text-[9px] font-bold text-gray-500 uppercase leading-tight">{stat.title}</p>
              </div>
              <p className="text-lg font-bold text-gray-900 tracking-tight self-end text-right w-full">{stat.renderValue}</p>
            </div>
          ))}
        </div>

        {/* Charts Column (Middle) */}
        <div className="col-span-4 flex flex-col gap-3 h-full">

          {/* Sector Chart */}
          <div ref={sectorChartRef} className="flex-1 bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-xs font-bold text-gray-800 flex items-center gap-2">
                <div className="w-1 h-3 bg-indigo-500 rounded-full"></div>
                Sektörel
              </h3>
              <button onClick={() => setExpandedChart('SECTOR')} className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-3 py-1.5 rounded-md hover:bg-indigo-200 transition-colors shadow-sm">
                Detaylı Görüntüle
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {/* Background track ring */}
                  <Pie
                    data={[{ value: 1 }]}
                    cx="40%"
                    cy="50%"
                    innerRadius="68%"
                    outerRadius="92%"
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    <Cell fill="#f1f5f9" />
                  </Pie>
                  {/* @ts-ignore */}
                  <Pie
                    activeIndex={activeIndex ?? -1}
                    activeShape={renderActiveShape}
                    data={metrics.sectorData}
                    cx="40%"
                    cy="50%"
                    innerRadius="70%"
                    outerRadius="90%"
                    paddingAngle={3}
                    dataKey="value"
                    onMouseEnter={onPieEnter}
                    onMouseLeave={onPieLeave}
                    onClick={handlePieClick}
                    cornerRadius={6}
                    stroke="none"
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {metrics.sectorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    <Label content={<CustomCenterLabel hasActiveIndex={activeIndex !== null} totalCompanies={metrics.totalCompanies} />} position="center" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Business Tag Chart */}
          <div ref={tagChartRef} className="flex-1 bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-xs font-bold text-gray-800 flex items-center gap-2">
                <div className="w-1 h-3 bg-pink-500 rounded-full"></div>
                İş Alanları
              </h3>
              <button onClick={() => setExpandedChart('TAG')} className="text-[10px] font-bold text-pink-700 bg-pink-100 px-3 py-1.5 rounded-md hover:bg-pink-200 transition-colors shadow-sm">
                Detaylı Görüntüle
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {/* Background track ring */}
                  <Pie
                    data={[{ value: 1 }]}
                    cx="40%"
                    cy="50%"
                    innerRadius="68%"
                    outerRadius="92%"
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    <Cell fill="#f1f5f9" />
                  </Pie>
                  {/* @ts-ignore */}
                  <Pie
                    activeIndex={activeTagIndex ?? -1}
                    activeShape={renderActiveShape}
                    data={tagData}
                    cx="40%"
                    cy="50%"
                    innerRadius="70%"
                    outerRadius="90%"
                    paddingAngle={3}
                    dataKey="value"
                    onMouseEnter={onTagEnter}
                    onMouseLeave={onTagLeave}
                    onClick={handleTagClick}
                    cornerRadius={6}
                    stroke="none"
                    animationBegin={200}
                    animationDuration={800}
                  >
                    {tagData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Calendar Widget (Right) */}
        <div ref={calendarRef} className="col-span-6 h-full min-h-0">
          <ContractCalendar leases={allLeases} />
        </div>

      </div >

      {/* Chart Detail Modal */}
      {
        expandedChart && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden relative">
              <button
                onClick={() => setExpandedChart(null)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>

              <div className="p-6 border-b border-gray-100">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                  <div className={`w - 2 h - 8 rounded - full ${expandedChart === 'SECTOR' ? 'bg-indigo-500' : 'bg-pink-500'} `}></div>
                  {expandedChart === 'SECTOR' ? 'Tüm Sektörel Dağılım' : 'Tüm İş Etiketi Dağılımı'}
                </h2>
              </div>

              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Left: Big Chart */}
                <div className="flex-1 min-h-[400px] p-6 flex items-center justify-center bg-gray-50/30">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      {/* @ts-ignore */}
                      <Pie
                        activeIndex={activeIndex}
                        activeShape={renderActiveShape}
                        data={expandedChart === 'SECTOR' ? metrics.sectorData : allTagData}
                        cx="35%"
                        cy="50%"
                        innerRadius={100}
                        outerRadius={140}
                        paddingAngle={3}
                        dataKey="value"
                        onMouseEnter={onPieEnter}
                        onMouseLeave={onPieLeave}
                        onClick={expandedChart === 'SECTOR' ? handlePieClick : handleTagClick}
                        cornerRadius={8}
                        stroke="none"
                        className="cursor-pointer focus:outline-none"
                      >
                        {(expandedChart === 'SECTOR' ? metrics.sectorData : allTagData).map((entry, index) => (
                          <Cell
                            key={`cell - ${index} `}
                            fill={COLORS[(index + (expandedChart === 'TAG' ? 3 : 0)) % COLORS.length]}
                          />
                        ))}
                        <Label
                          content={<CustomCenterLabel hasActiveIndex={activeIndex !== null} totalCompanies={metrics.totalCompanies} />}
                          position="center"
                        />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Right: Scrollable List */}
                <div className="w-full lg:w-[350px] border-l border-gray-100 flex flex-col bg-white">
                  <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-500 text-xs uppercase tracking-wider">
                    {expandedChart === 'SECTOR' ? 'Sektör Listesi' : 'Etiket Listesi'}
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {(expandedChart === 'SECTOR' ? metrics.sectorData : allTagData).map((item, index) => (
                      <div
                        key={index}
                        onClick={() => expandedChart === 'SECTOR' ? handlePieClick(item) : handleTagClick(item)}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group border border-transparent hover:border-gray-200"
                      >
                        <div className="flex items-start gap-3 overflow-hidden">
                          <div
                            className="w-3 h-3 rounded-full shrink-0 shadow-sm mt-1.5"
                            style={{ backgroundColor: COLORS[(index + (expandedChart === 'TAG' ? 3 : 0)) % COLORS.length] }}
                          />
                          <span className="text-sm font-semibold text-gray-700 group-hover:text-indigo-700 transition-colors leading-snug">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                            % {((item.value / metrics.totalCompanies) * 100).toFixed(1)}
                          </span>
                          <span className="text-xs font-bold text-gray-900 min-w-[30px] text-right">
                            {item.value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Interactive Tutorial System via Portal */}
      {showHelp && createPortal(
        <div className="fixed inset-0 z-[10000] pointer-events-auto isolate">
          {/* Note: Full screen backdrop removed to fix blur issue. Highligher uses shadow cutout. */}

          {/* Dynamic Highlighter Box */}
          {targetRect && (
            <div
              className="fixed z-[10001] transition-all duration-300 ease-out pointer-events-none rounded-2xl"
              style={{
                top: targetRect.top - 4,
                left: targetRect.left - 4,
                width: targetRect.width + 8,
                height: targetRect.height + 8,
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.65)' // Cutout effect (Darken rest of screen)
              }}
            >
              {/* Border Ring (No BG) */}
              <div className={`absolute inset-0 rounded-2xl border-[3px] animate-pulse ${helpSlide === 0 ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)]' :
                helpSlide === 1 ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.5)]' :
                  helpSlide === 2 ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]' :
                    'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]'
                }`}></div>
            </div>
          )}

          {/* Tutorial Cards - Positioned Relative to Target */}
          {targetRect && (
            <div
              className={`fixed z-[10002] bg-white rounded-2xl shadow-2xl p-5 max-w-sm border-2 animate-in fade-in zoom-in-95 duration-300 ${helpSlide === 0 ? 'border-indigo-500' :
                helpSlide === 1 ? 'border-pink-500' :
                  helpSlide === 2 ? 'border-blue-500' :
                    'border-emerald-500'
                }`}
              style={{
                // Auto position logic:
                // If chart (0, 1), try to place on RIGHT side first? Or Bottom if no space. 
                // Let's stick to "Bottom Aligned" logic generally, but if it goes off bottom, move it up.
                // Simple version: 16px below target.
                top: Math.min(window.innerHeight - 250, targetRect.bottom + 16),
                left: Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 192), window.innerWidth - 400) // Center horizontally relative to target
              }}
            >
              {/* Arrow pointing up to target */}
              <div
                className={`absolute -top-2 w-4 h-4 bg-white border-t-2 border-l-2 transform rotate-45 ${helpSlide === 0 ? 'border-indigo-500' :
                  helpSlide === 1 ? 'border-pink-500' :
                    helpSlide === 2 ? 'border-blue-500' :
                      'border-emerald-500'
                  }`}
                style={{
                  left: Math.min(Math.max(20, (targetRect.left - Math.min(Math.max(16, targetRect.left + (targetRect.width / 2) - 192), window.innerWidth - 400)) + (targetRect.width / 2) - 8), 340)
                }}
              ></div>

              {/* Slide 0: Sector */}
              {helpSlide === 0 && (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                      <Info className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">Sektörel Dağılım</h3>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Bu grafik, teknokentteki firmaların hangi sektörlerde yoğunlaştığını gösterir. Her dilim üzerine geldiğinizde detaylı bilgi görüntülenir.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Atla</button>
                    <button onClick={() => setHelpSlide(1)} className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">Sıradaki</button>
                  </div>
                </>
              )}

              {/* Slide 1: Tags */}
              {helpSlide === 1 && (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-pink-100 rounded-lg shrink-0">
                      <Info className="w-5 h-5 text-pink-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">İş Alanları</h3>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Firmaların iş alanı etiketlerine göre dağılımını gösterir. Bir firma birden fazla iş alanında faaliyet gösterebilir.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Atla</button>
                    <button onClick={() => setHelpSlide(2)} className="px-3 py-1.5 text-xs font-bold bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors shadow-lg shadow-pink-200">Sıradaki</button>
                  </div>
                </>
              )}

              {/* Slide 2: Campus */}
              {helpSlide === 2 && (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                      <Info className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">Kampüs Kartları</h3>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Her kampüsün anlık doluluk durumunu gösterir. Karta tıklayarak detaylı istatistikleri görüntüleyebilirsiniz.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Atla</button>
                    <button onClick={() => setHelpSlide(3)} className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Sıradaki</button>
                  </div>
                </>
              )}

              {/* Slide 3: Calendar */}
              {helpSlide === 3 && (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-emerald-100 rounded-lg shrink-0">
                      <CalendarIcon className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">Sözleşme Takvimi</h3>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Firmaların sözleşme bitiş tarihlerini takip edin. Bir güne tıklayarak o gün sözleşmesi biten firmaların listesini görüntüleyin.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowHelp(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Kapat</button>
                    <button onClick={() => { setShowHelp(false); setHelpSlide(0); }} className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200">Tamamla</button>
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
        title="Dashboard Rehberi"
      >
        <Info className="w-7 h-7 group-hover:scale-110 transition-transform" />
      </button>
      </>
      )}
    </div >
  );
};

