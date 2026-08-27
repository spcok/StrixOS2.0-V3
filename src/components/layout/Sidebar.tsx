import { useState, useEffect, type ComponentType } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { useAuth } from '../../lib/auth';
import { 
  LayoutDashboard, 
  ClipboardList, 
  ShieldAlert,
  CalendarDays, 
  Apple, 
  Syringe, 
  Activity, 
  BriefcaseMedical, 
  AlertTriangle, 
  Wrench, 
  Users, 
  Clock, 
  CalendarHeart, 
  FileBadge, 
  FileWarning, 
  BarChart3, 
  Settings, 
  HelpCircle, 
  ChevronDown, 
  Utensils, 
  LogOut, 
  MapPin, 
  ArrowRightLeft,
  QrCode, 
  Skull, 
  Maximize, 
  Minimize, 
  X, 
  Feather,
  Sparkles, 
  Calendar as CalendarIcon
} from 'lucide-react';

import logoImg from '../../assets/logo.png';

export interface SidebarProps {
  isOpen?: boolean;
  onMobileClose?: () => void;
  onClose?: () => void;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => 
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  return isMobile;
}

function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => 
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return isOnline;
}

interface NavItem {
  name: string;
  to: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  requiredPermission?: string;
}

interface NavGroupData {
  title: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  items: NavItem[];
}

const navGroups: readonly NavGroupData[] = [
  {
    title: 'Husbandry',
    icon: Apple,
    items: [
      { name: 'Daily Logs', to: '/husbandry/daily-logs', icon: ClipboardList, requiredPermission: 'husbandry:read' },
      { name: 'Daily Rounds', to: '/husbandry/rounds', icon: CalendarDays, requiredPermission: 'husbandry:read' },
      { name: 'Feeding Schedule', to: '/husbandry/feeding', icon: Utensils, requiredPermission: 'husbandry:read' },
      { name: 'Compliance Audit', to: '/husbandry/missing-records', icon: ShieldAlert, requiredPermission: 'husbandry:read' },
    ]
  },
  {
    title: 'Clinical',
    icon: BriefcaseMedical,
    items: [
      { name: 'Medical Records', to: '/clinical/records', icon: BriefcaseMedical, requiredPermission: 'clinical:read' },
      { name: 'Medications', to: '/clinical/medications', icon: Syringe, requiredPermission: 'clinical:read' },
      { name: 'Isolation/Quarantine', to: '/clinical/isolation', icon: Activity, requiredPermission: 'clinical:read' },
      { name: 'Mortality Ledger', to: '/clinical/mortality', icon: Skull, requiredPermission: 'clinical:read' },
    ]
  },
  {
    title: 'Logistics',
    icon: ArrowRightLeft,
    items: [
      { name: 'Internal Movements', to: '/logistics/internal-movements', icon: MapPin, requiredPermission: 'logistics:read' },
      { name: 'External Transfers', to: '/logistics/external-transfers', icon: ArrowRightLeft, requiredPermission: 'logistics:read' },
    ]
  },
  {
    title: 'Vouchers and Events',
    icon: Sparkles,
    items: [
      { name: 'Vouchers', to: '/logistics/vouchers', icon: QrCode, requiredPermission: 'logistics:read' },
      { name: 'Events', to: '/logistics/events', icon: Sparkles, requiredPermission: 'logistics:read' },
      { name: 'Calendar', to: '/logistics/calendar', icon: CalendarIcon, requiredPermission: 'logistics:read' },
    ]
  },
  {
    title: 'Safety & Ops',
    icon: ShieldAlert,
    items: [
      { name: 'Safety Drills', to: '/safety/drills', icon: FileWarning, requiredPermission: 'safety:read' },
      { name: 'Incident Reports', to: '/safety/incidents', icon: AlertTriangle, requiredPermission: 'safety:read' },
      { name: 'First Aid', to: '/safety/first-aid', icon: BriefcaseMedical, requiredPermission: 'safety:read' },
      { name: 'Maintenance Requests', to: '/safety/maintenance', icon: Wrench, requiredPermission: 'safety:read' },
    ]
  },
  {
    title: 'Staff Hub',
    icon: Users,
    items: [
      { name: 'Staff Rota', to: '/staff/rota', icon: CalendarHeart, requiredPermission: 'hr:read' },
      { name: 'My Shifts', to: '/staff/shifts', icon: Clock, requiredPermission: 'timesheet:self' },
      { name: 'Leave Requests', to: '/staff/leave', icon: CalendarDays, requiredPermission: 'hr:read' },
      { name: 'Timesheets', to: '/staff/timesheets', icon: FileBadge, requiredPermission: 'hr:read' },
    ]
  }
] as const;

function NavGroup({ 
  group, 
  isOpen, 
  showDivider, 
  onMobileClose 
}: { 
  group: NavGroupData; 
  isOpen: boolean; 
  showDivider: boolean; 
  onMobileClose?: () => void; 
}) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const location = useLocation();
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();

  const filteredItems = group.items.filter((item) => {
    if (item.requiredPermission && !hasPermission(item.requiredPermission)) return false;
    return true;
  });

  if (filteredItems.length === 0) return null;

  const isActive = filteredItems.some((item) => location.pathname.startsWith(item.to));

  return (
    <div className="mb-2 text-left">
      {showDivider && <div className="h-px bg-slate-800/50 mx-4 my-3" />}
      
      <button 
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        title={!isOpen ? group.title : undefined}
        className={`w-full flex items-center ${isOpen ? 'justify-between px-3' : 'justify-center px-0'} py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors group cursor-pointer text-left`}
      >
        <div className="flex items-center gap-3 text-left">
          <group.icon size={16} className={`shrink-0 ${isActive ? 'text-emerald-500' : 'group-hover:text-slate-300'}`} />
          {isOpen && <span className="text-left">{group.title}</span>}
        </div>
        {isOpen && (
          <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
        )}
      </button>

      {isExpanded && isOpen && (
        <div className="mt-1 space-y-1 text-left">
          {filteredItems.map((item) => {
            const isItemActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.name}
                to={item.to}
                onClick={() => {
                  if (isMobile) onMobileClose?.();
                }}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold transition-all ml-7 text-left ${
                  isItemActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <item.icon size={16} className={`shrink-0 ${isItemActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="text-left">{item.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ isOpen = true, onMobileClose, onClose }: SidebarProps) {
  const { profile, user, signOut } = useAuth();
  const location = useLocation();
  const isOnline = useNetworkStatus();
  const isMobile = useIsMobile();
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [imgSrc, setImgSrc] = useState<string>(logoImg);
  const [imgError, setImgError] = useState<boolean>(false);

  const handleClose = onMobileClose ?? onClose;

  const handleLinkClick = () => {
    if (isMobile) handleClose?.();
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request bypassed:', err);
    }
  };

  const handleImgError = () => {
    if (imgSrc !== '/logo192.png') {
      setImgSrc('/logo192.png');
    } else {
      setImgError(true);
    }
  };

  const userInitial = (profile?.name ?? user?.email ?? 'U').charAt(0).toUpperCase();

  return (
    <aside className={`flex flex-col h-full bg-slate-900 border-r border-slate-800 transition-all duration-300 shrink-0 text-left ${isOpen ? 'w-64' : 'w-20'}`}>
      
      {/* Brand Header */}
      <div className={`p-4 flex items-center justify-between h-20 shrink-0 border-b border-slate-800/80 text-left ${isOpen ? 'px-5' : 'justify-center'}`}>
        <div className="flex items-center gap-3.5 text-left">
          {!imgError ? (
            <img 
              src={imgSrc} 
              alt="StrixOS Logo" 
              className={`object-contain shrink-0 transition-all ${isOpen ? 'w-11 h-11' : 'w-9 h-9'}`}
              onError={handleImgError}
            />
          ) : (
            <Feather className="w-8 h-8 text-emerald-400 shrink-0" />
          )}

          {isOpen && (
            <div className="flex-1 min-w-0 text-left">
              <h1 className="text-2xl font-black text-white tracking-tighter truncate leading-none text-left">
                Strix<span className="text-emerald-500">OS</span>
              </h1>
              <p className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest truncate mt-1 text-left">
                Avian Management
              </p>
            </div>
          )}
        </div>

        {isMobile && handleClose && isOpen && (
          <button 
            type="button"
            onClick={handleClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Offline Status Badge */}
      {!isOnline && isOpen && (
        <div className="mx-4 mt-4 flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse text-left">
          <ShieldAlert size={14} className="shrink-0" />
          <span>Offline Mode</span>
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar text-left">
        <Link
          to="/"
          onClick={handleLinkClick}
          title={!isOpen ? 'Dashboard' : undefined}
          className={`flex items-center ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 mb-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors group text-left [&.active]:bg-emerald-500/10 [&.active]:text-emerald-400`}
          activeOptions={{ exact: true }}
        >
          <LayoutDashboard size={18} className="shrink-0 transition-colors group-[&.active]:text-emerald-400" />
          {isOpen && <span className="text-left">Dashboard</span>}
        </Link>
        
        {navGroups.map((group, index) => (
          <NavGroup 
            key={group.title} 
            group={group} 
            isOpen={isOpen} 
            showDivider={index !== 0} 
            onMobileClose={handleClose}
          />
        ))}

        <div className="h-px bg-slate-800/50 mx-4 my-3" />

        {/* Reports */}
        <Link
          to="/reports"
          onClick={handleLinkClick}
          title={!isOpen ? 'Reports' : undefined}
          className={`flex items-center ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 mb-1.5 rounded-xl text-sm font-bold transition-all text-left ${
            location.pathname === '/reports'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <BarChart3 size={18} className="shrink-0" />
          {isOpen && <span className="text-left">Reports</span>}
        </Link>

        {/* Settings */}
        <Link
          to="/settings"
          onClick={handleLinkClick}
          title={!isOpen ? 'Settings' : undefined}
          className={`flex items-center ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 mb-1.5 rounded-xl text-sm font-bold transition-all text-left ${
            location.pathname.startsWith('/settings')
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Settings size={18} className="shrink-0" />
          {isOpen && <span className="text-left">Settings</span>}
        </Link>
      </nav>

      {/* Footer Controls & User Badge */}
      <div className="p-4 border-t border-slate-800/80 shrink-0 space-y-2 bg-slate-900 text-left">
        <button 
          type="button"
          onClick={toggleFullscreen}
          className={`w-full flex items-center ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors group cursor-pointer text-left`}
          title={!isOpen ? (isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen') : undefined}
        >
          {isFullscreen ? (
            <Minimize size={16} className="shrink-0 text-emerald-400" />
          ) : (
            <Maximize size={16} className="shrink-0 group-hover:text-slate-300" />
          )}
          {isOpen && <span className="text-left">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>}
        </button>

        <button 
          type="button"
          className={`w-full flex items-center ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors cursor-pointer text-left`}
          title={!isOpen ? 'Help Center' : undefined}
        >
          <HelpCircle size={16} className="shrink-0" />
          {isOpen && <span className="text-left">Help Center</span>}
        </button>

        {/* User Identity Chip */}
        <div className={`flex items-center gap-3 pt-2 border-t border-slate-800/60 text-left ${isOpen ? 'px-2' : 'justify-center'}`}>
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white font-black text-sm flex items-center justify-center shadow-inner shrink-0">
            {userInitial}
          </div>
          {isOpen && (
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-bold text-white truncate text-left">{profile?.name ?? user?.email ?? 'Staff Member'}</p>
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest truncate text-left">{profile?.role?.replace('_', ' ') ?? 'KEEPER'}</p>
            </div>
          )}
        </div>

        {/* Sign Out Trigger */}
        <button 
          type="button"
          onClick={() => signOut()}
          title={!isOpen ? 'Sign Out' : undefined}
          className={`w-full flex items-center ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors group cursor-pointer text-left`}
        >
          <LogOut size={16} className="shrink-0 group-hover:-translate-x-0.5 transition-transform text-slate-400 group-hover:text-rose-400" />
          {isOpen && <span className="text-left">Secure Logout</span>}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;