import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Clock, 
  Check, 
  AlertTriangle, 
  Loader2, 
  Pill, 
  UserCircle, 
  X, 
  Calendar, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { Animal, User } from '../../types';
import type { PrescriptionItem } from './PrescriptionList';

export interface MedicationAdministration {
  id: string;
  prescription_id: string;
  animal_id: string;
  administered_at: string;
  administered_by: string;
  status: 'GIVEN' | 'REFUSED' | 'VOMITED' | 'DROPPED' | 'UNAVAILABLE' | 'OMITTED' | 'HOSPITALIZED' | string;
  actual_dose_given?: string | null;
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
}

export interface DigitalMARProps {
  prescriptions: PrescriptionItem[];
  isOnline: boolean;
}

interface ActiveSlotContext {
  rx: PrescriptionItem;
  slotIndex: number;
}

const getLocalDateString = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLocalTimeString = (d = new Date()): string => {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Determines scheduled administration dose slots per day based on veterinary posology
const getExpectedSlots = (freq: string | undefined): number => {
  switch (freq?.toUpperCase()) {
    case 'BID':
      return 2;
    case 'TID':
      return 3;
    case 'QID':
      return 4;
    default:
      return 1; // SID, EOD, STAT, WEEKLY, MONTHLY, PRN
  }
};

export default function DigitalMAR({ prescriptions, isOnline }: DigitalMARProps) {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => getLocalDateString());

  // Administration Modal State
  const [activeSlot, setActiveSlot] = useState<ActiveSlotContext | null>(null);
  const [adminStatus, setAdminStatus] = useState<string>('GIVEN');
  const [adminTime, setAdminTime] = useState<string>(() => getLocalTimeString());
  const [adminStaffId, setAdminStaffId] = useState<string>(user?.id || profile?.id || '');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync initial logged-in user into administration state
  useEffect(() => {
    if (user?.id && !adminStaffId) {
      setAdminStaffId(user.id);
    }
  }, [user?.id, adminStaffId]);

  // Fetch complete staff directory (including soft-deleted accounts to preserve historical audit signatures)[cite: 3]
  const { data: staff = [] } = useQuery<User[]>({
    queryKey: ['staff_directory_mar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, initials, is_active, role')
        .order('name');
      if (error) throw error;
      return (data || []) as User[];
    },
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
  });

  // Fetch administrations strictly bounded to the selected calendar day (UTC-safe ISO range)[cite: 3]
  const { data: administrations = [], isLoading: loadingAdmins } = useQuery<MedicationAdministration[]>({
    queryKey: ['medication_administrations', selectedDateStr],
    queryFn: async () => {
      const start = `${selectedDateStr}T00:00:00.000Z`;
      const end = `${selectedDateStr}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from('medication_administrations')
        .select('*')
        .gte('administered_at', start)
        .lte('administered_at', end)
        .order('administered_at', { ascending: true });

      if (error) throw error;
      return (data || []) as MedicationAdministration[];
    },
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
  });

  // O(1) in-memory staff lookup map[cite: 3]
  const staffMap = useMemo(() => {
    const map = new Map<string, User>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeSlot) return;

      if (adminStatus !== 'GIVEN' && !adminNotes.trim()) {
        throw new Error('An explanatory note is required when medication is not administered normally.');
      }

      // Safe date-time composition to avoid negative timezone shifting[cite: 3]
      const administeredAt = new Date(`${selectedDateStr}T${adminTime}:00`).toISOString();
      const recordId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2);

      const payload: Partial<MedicationAdministration> = {
        id: recordId,
        prescription_id: activeSlot.rx.id,
        animal_id: activeSlot.rx.animal_id,
        administered_at: administeredAt,
        status: adminStatus,
        administered_by: adminStaffId || user?.id || '',
        actual_dose_given: activeSlot.rx.dosage,
        notes: adminNotes.trim() || null,
        created_by: user?.id || profile?.id || null,
      };

      const { error } = await supabase.from('medication_administrations').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Medication administration logged');
      queryClient.invalidateQueries({ queryKey: ['medication_administrations', selectedDateStr] });
      closeModal();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to log dose administration';
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const closeModal = () => {
    setActiveSlot(null);
    setAdminStatus('GIVEN');
    setAdminTime(getLocalTimeString());
    setAdminNotes('');
    setSaveError(null);
  };

  const handleOpenSlot = (rx: PrescriptionItem, slotIndex: number) => {
    setActiveSlot({ rx, slotIndex });
    setAdminStaffId(user?.id || profile?.id || '');
    setAdminTime(getLocalTimeString());
    setAdminStatus('GIVEN');
    setAdminNotes('');
    setSaveError(null);
  };

  const formatDisplaySelectedDate = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Date Header & Control Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
            Daily Administration Grid (e-MAR)
          </h2>
          <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {formatDisplaySelectedDate(selectedDateStr)}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {selectedDateStr !== getLocalDateString() && (
            <button
              type="button"
              onClick={() => setSelectedDateStr(getLocalDateString())}
              className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-xs"
            >
              Today
            </button>
          )}
          <input
            type="date"
            value={selectedDateStr}
            onChange={(e) => setSelectedDateStr(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 cursor-pointer w-full sm:w-auto"
          />
        </div>
      </div>

      {/* MAR Grid Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {prescriptions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <Pill size={32} className="opacity-20 mb-2" />
            <p className="text-xs font-black uppercase tracking-widest">No Active Medication Schedules</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {prescriptions.map((rx) => {
              const expectedSlots = getExpectedSlots(rx.frequency);
              const rxAdmins = administrations.filter((a) => a.prescription_id === rx.id);

              return (
                <div
                  key={rx.id}
                  className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  {/* Demographics & Posology */}
                  <div className="lg:w-1/3 shrink-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-slate-900 text-sm tracking-tight truncate">
                        {rx.drug_name}
                      </h3>
                      <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                        {rx.dosage}
                      </span>
                    </div>

                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">
                      {rx.animals?.name || 'Unknown Specimen'} ({rx.animals?.species || '--'}) &bull;{' '}
                      <span className="text-blue-600">{rx.route}</span> &bull; {rx.frequency}
                    </p>

                    {rx.special_instructions && (
                      <p className="text-[10px] font-medium italic text-rose-600 line-clamp-1">
                        &ldquo;{rx.special_instructions}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* Pre-generated Administration Slots */}
                  <div className="flex-1 flex flex-wrap gap-2.5 items-center lg:justify-end">
                    {Array.from({ length: expectedSlots }).map((_, idx) => {
                      const completedAdmin = rxAdmins[idx];

                      if (completedAdmin) {
                        const isGiven = completedAdmin.status === 'GIVEN';
                        const staffMember = staffMap.get(completedAdmin.administered_by);
                        
                        const adminDate = new Date(completedAdmin.administered_at);
                        const displayTime = getLocalTimeString(adminDate);

                        return (
                          <div
                            key={completedAdmin.id || idx}
                            className={`relative flex items-center justify-between p-2.5 rounded-xl border w-full sm:w-44 shrink-0 shadow-xs ${
                              isGiven
                                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                                : 'bg-rose-50/80 border-rose-200 text-rose-900'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <p className="text-[10px] font-black uppercase tracking-wider truncate">
                                {completedAdmin.status === 'GIVEN' ? 'Administered' : completedAdmin.status}
                              </p>
                              <p className="text-[9px] font-bold text-slate-500 mt-0.5 truncate">
                                {displayTime} &bull; {staffMember?.initials || staffMember?.name || 'Staff'}
                              </p>
                            </div>
                            {isGiven ? (
                              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            ) : (
                              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                            )}
                          </div>
                        );
                      }

                      // Empty Pending Dose Slot
                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => handleOpenSlot(rx, idx)}
                          disabled={!isOnline}
                          className="flex items-center justify-center p-2.5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 text-slate-400 transition-all w-full sm:w-44 shrink-0 group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95"
                        >
                          <span className="text-[9px] font-black uppercase tracking-widest group-hover:scale-105 transition-transform flex items-center gap-1.5">
                            <Clock size={12} className="text-slate-400 group-hover:text-blue-600" />
                            Sign Off Dose {idx + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Administration Sign-Off Modal */}
      {activeSlot && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200/80">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 bg-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-black shadow-xs shrink-0">
                  <Pill size={16} />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
                    Log Administration
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Dose {activeSlot.slotIndex + 1} &bull; {activeSlot.rx.drug_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-3.5 bg-white overflow-y-auto custom-scrollbar">
              {saveError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-600" />
                  <div>{saveError}</div>
                </div>
              )}

              <div>
                <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Administration Outcome *
                </label>
                <select
                  value={adminStatus}
                  onChange={(e) => setAdminStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                >
                  <option value="GIVEN">Administered Normally (Given)</option>
                  <option value="REFUSED">Refused by Patient (R)</option>
                  <option value="VOMITED">Regurgitated / Vomited (V)</option>
                  <option value="DROPPED">Dropped / Spat Out (S)</option>
                  <option value="UNAVAILABLE">Medication Unavailable (N/A)</option>
                  <option value="OMITTED">Clinically Omitted (O)</option>
                  <option value="HOSPITALIZED">Hospitalized Offsite (H)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Recorded Time *
                  </label>
                  <input
                    type="time"
                    value={adminTime}
                    onChange={(e) => setAdminTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Administered By *
                  </label>
                  <select
                    value={adminStaffId}
                    onChange={(e) => setAdminStaffId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  >
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.initials ? `(${s.initials})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {adminStatus !== 'GIVEN' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2 text-amber-900">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-bold leading-tight">
                    Statutory ZLA requirement: You must provide explanatory notes whenever a scheduled dose is not given normally.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Observations / Exception Notes {adminStatus !== 'GIVEN' && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="e.g. Hidden in day-old chick, swallowed immediately without hesitation."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || (adminStatus !== 'GIVEN' && !adminNotes.trim())}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all shadow-xs active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Sign Off Dose</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}