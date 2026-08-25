import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Users, Scale, X, MapPin, Activity, ListOrdered, 
  FileText, Edit2, User, Calendar, Loader2, Clock 
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import type { Animal, DailyLog } from '../../types';
import AnimalFormModal from './AnimalFormModal';

export interface MobProfileProps {
  isOpen?: boolean;
  mob: Animal;
  members?: Animal[];
  onClose: () => void;
}

interface MobLogRecord {
  id: string;
  animal_id: string;
  log_type?: string | null;
  notes?: string | null;
  recorded_at?: string | null;
  log_date?: string | null;
  created_at?: string;
  is_deleted?: boolean;
}

// Accurate Age Calculator using schema date_of_birth
const calculateAge = (dobString: string | null | undefined): string | null => {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();

  if (months < 0 || (months === 0 && now.getDate() < dob.getDate())) {
    years--;
    months += 12;
  }

  if (years === 0 && months === 0) return 'Newborn';
  if (years === 0) return `${months}m`;
  return months > 0 ? `${years}y ${months}m` : `${years}y`;
};

export function MobProfile({ isOpen = true, mob, members = [], onClose }: MobProfileProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Group-level log telemetry query
  const { data: mobLogs = [], isPending: isLogsLoading } = useQuery<MobLogRecord[]>({
    queryKey: ['strict_logs', mob.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('animal_id', mob.id)
        .eq('is_deleted', false)
        .order('recorded_at', { ascending: false })
        .limit(20);

      if (error) {
        // Fallback for schemas ordering by log_date
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('daily_logs')
          .select('*')
          .eq('animal_id', mob.id)
          .eq('is_deleted', false)
          .order('log_date', { ascending: false })
          .limit(20);

        if (fallbackErr) throw fallbackErr;
        return (fallbackData || []) as MobLogRecord[];
      }

      return (data || []) as MobLogRecord[];
    },
    enabled: Boolean(mob.id) && isOpen,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  // Roll-Up Aggregation Engine (Schema Aligned)
  const metrics = useMemo(() => {
    let males = 0;
    let females = 0;
    let unknowns = 0;
    let totalWeight = 0;
    let weighCount = 0;

    const validDobs = members
      .map((m) => m.date_of_birth)
      .filter((dob): dob is string => Boolean(dob))
      .map((dob) => new Date(dob).getTime())
      .filter((time) => !Number.isNaN(time));

    members.forEach((m) => {
      const g = m.gender?.toUpperCase().trim();
      if (g === 'M' || g === 'MALE') males++;
      else if (g === 'F' || g === 'FEMALE') females++;
      else unknowns++;

      const weight = m.flying_weight ?? m.winter_weight ?? m.average_target_weight;
      if (typeof weight === 'number' && weight > 0) {
        totalWeight += weight;
        weighCount++;
      }
    });

    const avgWeight = weighCount > 0 ? Math.round(totalWeight / weighCount) : 0;
    const mfu = `${males}.${females}.${unknowns}`;

    let ageSpread = '--';
    if (validDobs.length > 0) {
      const oldestDate = new Date(Math.min(...validDobs)).toISOString();
      const youngestDate = new Date(Math.max(...validDobs)).toISOString();

      const oldestAge = calculateAge(oldestDate);
      const youngestAge = calculateAge(youngestDate);

      if (oldestAge && youngestAge) {
        ageSpread = oldestAge === youngestAge ? oldestAge : `${youngestAge} - ${oldestAge}`;
      }
    }

    return {
      headcount: members.length,
      mfu,
      avgWeight,
      unit: members[0]?.weight_unit || 'g',
      ageSpread,
    };
  }, [members]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 font-sans">
      <div className="bg-slate-50 w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Bar */}
        <div className="bg-white px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100 shadow-xs shrink-0">
              <Users size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">{mob.name}</h2>
                <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-blue-200 hidden sm:inline-block">
                  Colony / Mob
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                {mob.species || 'Unassigned Species'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button 
              type="button"
              onClick={() => setIsEditModalOpen(true)} 
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-blue-100" 
              title="Edit Mob Record"
            >
              <Edit2 size={18} />
            </button>
            <button 
              type="button"
              onClick={onClose} 
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-rose-100" 
              title="Close Profile"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 custom-scrollbar">
          
          {/* Biometric Roll-Ups (4-Column Grid) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                <ListOrdered size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">Demographic</p>
                <p className="text-lg lg:text-xl font-black text-slate-900 mt-0.5">{metrics.mfu}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <Scale size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">Avg Weight</p>
                <p className="text-lg lg:text-xl font-black text-slate-900 mt-0.5">
                  {metrics.avgWeight > 0 ? `${metrics.avgWeight}${metrics.unit}` : '--'}
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                <Calendar size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">Age Spread</p>
                <p className="text-sm lg:text-base font-black text-slate-900 mt-0.5 truncate" title={metrics.ageSpread}>
                  {metrics.ageSpread}
                </p>
              </div>
            </div>

            {/* Location Card */}
            <div 
              onClick={() => setIsEditModalOpen(true)}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-2 cursor-pointer group hover:border-blue-300 hover:shadow-sm transition-all"
              title="Click to reassign Location"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shrink-0">
                  <MapPin size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors truncate">Location</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{mob.location || 'Unassigned'}</p>
                </div>
              </div>
              <div className="text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-blue-500 transition-all shrink-0 hidden lg:block">
                <Edit2 size={16} />
              </div>
            </div>
          </div>

          {/* Stacked Rows */}
          <div className="flex flex-col gap-6">
            
            {/* Row 1: Active Members Full-Width List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col max-h-[400px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center shrink-0">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Activity size={14} className="text-blue-500" /> Active Members ({metrics.headcount})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {members.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                    No active individuals assigned.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {members.map((m) => {
                      const photoUrl = m.profile_image_url;
                      const dobVal = m.date_of_birth;

                      return (
                        <div 
                          key={m.id} 
                          className="flex items-center p-3 hover:bg-slate-50/80 rounded-xl border border-transparent hover:border-slate-100 transition-colors gap-4"
                        >
                          {/* 1. Avatar */}
                          {photoUrl ? (
                            <img 
                              src={photoUrl} 
                              alt={m.name} 
                              className="w-10 h-10 rounded-full object-cover shadow-xs border border-slate-200 shrink-0" 
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center shadow-xs shrink-0">
                              <User size={16} />
                            </div>
                          )}

                          {/* 2. Name & Species */}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-bold text-slate-900 truncate">{m.name}</span>
                            <span className="text-[10px] font-medium text-slate-500 truncate">{m.species || 'Unknown Species'}</span>
                          </div>

                          {/* 3. Age & DOB */}
                          <div className="hidden sm:flex flex-col min-w-0 flex-1 px-4 border-l border-slate-100">
                            <span className="text-xs font-bold text-slate-700 truncate">
                              {dobVal ? calculateAge(dobVal) : 'No DOB recorded'}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400 truncate mt-0.5">
                              {dobVal ? format(parseISO(dobVal), 'dd MMM yyyy') : '--'}
                            </span>
                          </div>

                          {/* 4. Gender & Weight */}
                          <div className="flex items-center gap-4 text-xs font-bold text-slate-500 shrink-0 border-l border-slate-100 pl-4">
                            <span className="bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600 border border-slate-200/60 shadow-xs">
                              {m.gender === 'MALE' || m.gender === 'M' ? 'M' : m.gender === 'FEMALE' || m.gender === 'F' ? 'F' : 'U'}
                            </span>
                            <span className="w-16 text-right tabular-nums">
                              {m.flying_weight ? `${m.flying_weight}${m.weight_unit || 'g'}` : '--'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Mob-Level Logs Full-Width List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col max-h-[400px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center shrink-0">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <FileText size={14} className="text-emerald-500" /> Group Husbandry Logs
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                {isLogsLoading ? (
                  <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest flex flex-col items-center gap-2">
                    <Loader2 size={20} className="animate-spin text-emerald-500" />
                    Loading logs...
                  </div>
                ) : mobLogs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                    No group-level logs found.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mobLogs.map((log) => {
                      const logDateStr = log.recorded_at || log.log_date;
                      return (
                        <div key={log.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row gap-3 sm:gap-6">
                          <div className="flex flex-col gap-1.5 min-w-[140px] shrink-0">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-100/60 px-2 py-0.5 rounded-md inline-block w-max">
                              {log.log_type || 'GENERAL'}
                            </span>
                            {logDateStr && (
                              <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <Clock size={12} className="text-slate-400" />
                                {format(parseISO(logDateStr), 'dd MMM yyyy HH:mm')}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 border-t sm:border-t-0 sm:border-l border-slate-200/60 pt-2 sm:pt-0 sm:pl-6">
                            <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                              {log.notes || 'No notes provided.'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>

      {isEditModalOpen && (
        <AnimalFormModal 
          isOpen={isEditModalOpen} 
          onClose={() => setIsEditModalOpen(false)} 
          initialData={mob} 
        />
      )}
    </div>
  );
}

export default MobProfile;