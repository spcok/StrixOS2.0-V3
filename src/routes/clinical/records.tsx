import { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Stethoscope,
  Search,
  Plus,
  Activity,
  ShieldAlert,
  FileText,
  ChevronRight,
  X,
  Loader2,
  UserRound,
  AlertCircle,
  CalendarClock,
  Scale,
  MapPin,
  Cake,
  ChevronDown,
  Trash2,
  Edit,
  Pill,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { Animal, User, ClinicalRecord, WeightLog } from '../../types';
import PrescriptionFormModal from '../../components/medical/PrescriptionFormModal';

export const Route = createFileRoute('/clinical/records')({
  component: ClinicalRecordsModule,
});

interface EnrichedClinicalRecord extends ClinicalRecord {
  weight_logs?: { weight_grams?: number } | { weight_grams?: number }[] | null;
  weight?: { weight_grams?: number } | { weight_grams?: number }[] | null;
}

function formatAgeWithDOB(dob: string | null | undefined): string {
  if (!dob) return 'Unknown Age';
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return 'Unknown Age';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  const formattedDob = birthDate.toLocaleDateString('en-GB');
  return `${age <= 0 ? '< 1 Year Old' : `${age} Years Old`} (DOB: ${formattedDob})`;
}

// 30-Day ZLA Compliance Lock Check
function isEditable(createdAt: string | undefined): boolean {
  if (!createdAt) return true;
  const recordDate = new Date(createdAt);
  if (Number.isNaN(recordDate.getTime())) return true;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return recordDate > thirtyDaysAgo;
}

export function ClinicalRecordsModule() {
  const { hasPermission, profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);

  // Modal States
  const [isSOAPModalOpen, setIsSOAPModalOpen] = useState(false);
  const [isMARModalOpen, setIsMARModalOpen] = useState(false);
  const [recordToEdit, setRecordToEdit] = useState<EnrichedClinicalRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<{ recordId: string; weightLogId: string | null } | null>(null);
  const [linkedClinicalIdForMAR, setLinkedClinicalIdForMAR] = useState<string | null>(null);

  // Collapsible Records State
  const [expandedRecords, setExpandedRecords] = useState<Record<string, boolean>>({});
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const toggleRecord = (id: string) => {
    setExpandedRecords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // --- QUERIES ---
  const { data: animals = [], isLoading: isLoadingAnimals } = useQuery<Animal[]>({
    queryKey: ['clinical_animals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('id, name, species, ring_number, average_target_weight, date_of_birth, location, category, record_type, profile_image_url')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data || []) as Animal[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
  });

  const { data: staffMembers = [], isLoading: isStaffLoading } = useQuery<User[]>({
    queryKey: ['active_staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role, initials')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data || []) as User[];
    },
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
  });

  const { data: records = [], isLoading: isLoadingRecords } = useQuery<EnrichedClinicalRecord[]>({
    queryKey: ['clinical_records', selectedAnimalId],
    enabled: Boolean(selectedAnimalId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinical_records')
        .select(`
          *,
          weight_logs ( weight_grams )
        `)
        .eq('animal_id', selectedAnimalId)
        .eq('is_deleted', false)
        .order('record_date', { ascending: false });

      if (error) {
        console.error('Timeline Query Error:', error);
        toast.error(`Database Error: ${error.message}`);
        throw error;
      }
      return (data || []) as EnrichedClinicalRecord[];
    },
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
  });

  const { data: activeMars = [] } = useQuery<{ id: string }[]>({
    queryKey: ['active_mars', selectedAnimalId],
    enabled: Boolean(selectedAnimalId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinical_schedule')
        .select('id')
        .eq('animal_id', selectedAnimalId)
        .eq('status', 'ACTIVE')
        .eq('is_deleted', false);
      if (error && error.code !== 'PGRST116') throw error;
      return (data || []) as { id: string }[];
    },
    staleTime: 1000 * 60 * 2,
    networkMode: 'offlineFirst',
  });

  const selectedAnimal = useMemo(
    () => animals.find((a) => a.id === selectedAnimalId),
    [animals, selectedAnimalId]
  );

  const filteredAnimals = useMemo(() => {
    if (!searchQuery) return animals;
    const lowerQuery = searchQuery.toLowerCase();
    return animals.filter(
      (a) =>
        a.name?.toLowerCase().includes(lowerQuery) ||
        a.ring_number?.toLowerCase().includes(lowerQuery) ||
        a.species?.toLowerCase().includes(lowerQuery)
    );
  }, [animals, searchQuery]);

  // --- DELETE MUTATION ---
  const deleteMutation = useMutation({
    mutationFn: async ({ recordId, weightLogId }: { recordId: string; weightLogId: string | null }) => {
      const { error: clinicalError } = await supabase
        .from('clinical_records')
        .update({ is_deleted: true, modified_by: profile?.id })
        .eq('id', recordId);
      if (clinicalError) throw clinicalError;

      if (weightLogId) {
        await supabase
          .from('weight_logs')
          .update({ is_deleted: true, modified_by: profile?.id })
          .eq('id', weightLogId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical_records', selectedAnimalId] });
      queryClient.invalidateQueries({ queryKey: ['weight_logs', selectedAnimalId] });
      toast.success('Clinical record permanently removed.');
      setRecordToDelete(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      toast.error(msg);
    },
  });

  const handleDeleteTrigger = (e: React.MouseEvent, recordId: string, weightLogId: string | null) => {
    e.stopPropagation();
    setRecordToDelete({ recordId, weightLogId });
  };

  const handleEditTrigger = (e: React.MouseEvent, record: EnrichedClinicalRecord) => {
    e.stopPropagation();
    setRecordToEdit(record);
    setIsSOAPModalOpen(true);
  };

  const handleOpenNewSOAP = () => {
    setRecordToEdit(null);
    setIsSOAPModalOpen(true);
  };

  const handleMARHandoff = (clinicalRecordId: string) => {
    setLinkedClinicalIdForMAR(clinicalRecordId);
    setIsMARModalOpen(true);
    setIsSOAPModalOpen(false);
    setRecordToEdit(null);
  };

  // Virtualizer for the clinical timeline
  const rowVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 140,
    overscan: 5,
  });

  return (
    <div className="flex h-full flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden animate-in fade-in duration-300 relative w-full font-sans">
      {/* LEFT PANEL: Patient Roster */}
      <div className="w-1/3 lg:w-1/4 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0">
        <div className="p-3.5 border-b border-slate-200 bg-white shrink-0">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-2.5">
            <Stethoscope size={14} className="text-emerald-600" /> Patient Roster
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Search patient or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {isLoadingAnimals ? (
            <div className="flex justify-center p-8">
              <Loader2 className="animate-spin text-emerald-500" size={20} />
            </div>
          ) : filteredAnimals.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-[11px] font-bold">No matching patients</p>
            </div>
          ) : (
            filteredAnimals.map((animal) => (
              <button
                type="button"
                key={animal.id}
                onClick={() => setSelectedAnimalId(animal.id)}
                className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between transition-all cursor-pointer ${
                  selectedAnimalId === animal.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'hover:bg-slate-200/80 text-slate-700'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <p className="font-bold text-xs truncate">{animal.name}</p>
                  <p
                    className={`text-[9px] uppercase tracking-widest font-black truncate mt-0.5 ${
                      selectedAnimalId === animal.id ? 'text-emerald-100' : 'text-slate-400'
                    }`}
                  >
                    {animal.species || 'Unclassified'} • {animal.ring_number || 'NO RING'}
                  </p>
                </div>
                <ChevronRight
                  size={14}
                  className={`shrink-0 ${selectedAnimalId === animal.id ? 'text-white' : 'text-slate-300'}`}
                />
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Master Patient Medical File */}
      <div className="flex-1 flex flex-col min-h-0 relative bg-slate-50/50 overflow-hidden">
        {!selectedAnimal ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <Stethoscope size={44} className="mb-3 opacity-20" />
            <p className="text-xs font-black uppercase tracking-widest">Select a Patient to view Medical Ledger</p>
          </div>
        ) : (
          <>
            {/* Vitals & Summary Ribbon */}
            <div className="bg-white border-b border-slate-200 p-4 lg:p-5 shrink-0 shadow-xs z-10">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
                    {selectedAnimal.name}
                  </h1>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                    {selectedAnimal.species || 'Species Unassigned'} • ID: {selectedAnimal.ring_number || 'N/A'}
                  </p>
                </div>
                {hasPermission('clinical:write') && (
                  <button
                    type="button"
                    onClick={handleOpenNewSOAP}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                  >
                    <Plus size={14} /> New Clinical Entry
                  </button>
                )}
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200">
                  <Cake size={12} /> {formatAgeWithDOB(selectedAnimal.date_of_birth)}
                </div>
                <div className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200">
                  <MapPin size={12} /> {selectedAnimal.location || 'Location Unknown'}
                </div>
                <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-200">
                  <Activity size={12} /> Target: {selectedAnimal.average_target_weight || 'N/A'}g
                </div>

                {activeMars.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate({ to: '/clinical/medications' })}
                    className="flex items-center gap-1.5 bg-rose-50 text-rose-700 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-200 animate-pulse cursor-pointer hover:bg-rose-100 transition-colors"
                  >
                    <Pill size={12} /> {activeMars.length} Active MAR{activeMars.length > 1 ? 's' : ''}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-slate-50 text-slate-400 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200">
                    <Pill size={12} /> No Active MARs
                  </div>
                )}
              </div>
            </div>

            {/* Chronological SOAP Timeline */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-6" ref={scrollParentRef}>
              {isLoadingRecords ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin text-emerald-500" size={28} />
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <FileText size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest">No Clinical Records Found</p>
                </div>
              ) : (
                <div className="space-y-3.5 pl-4 border-l-2 border-slate-200 ml-3">
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const record = records[virtualRow.index]!;
                    const isExpanded = Boolean(expandedRecords[record.id]);
                    const canEdit = hasPermission('clinical:write') && isEditable(record.created_at);

                    const conductorName =
                      record.conductor_role === 'EXTERNAL_VET'
                        ? `Dr. ${record.external_vet_name || 'Attending Vet'}`
                        : staffMembers.find((s) => s.id === record.conducted_by)?.name || 'Internal Staff';

                    const problemTitle = record.title || 'Clinical Evaluation';

                    let linkedWeight = 'N/A';
                    const wLog = record.weight_logs || record.weight;
                    if (wLog) {
                      if (Array.isArray(wLog) && wLog.length > 0 && wLog[0]?.weight_grams !== undefined) {
                        linkedWeight = `${wLog[0].weight_grams}`;
                      } else if (!Array.isArray(wLog) && wLog.weight_grams !== undefined) {
                        linkedWeight = `${wLog.weight_grams}`;
                      }
                    }

                    return (
                      <div key={record.id} className="relative pl-5">
                        <div className="absolute -left-[27px] top-3.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-emerald-600 shadow-xs z-10" />

                        <div
                          className={`bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all duration-200 ${
                            isExpanded ? 'ring-2 ring-emerald-500/20' : 'hover:border-slate-300'
                          }`}
                        >
                          {/* Collapsible Header */}
                          <div
                            onClick={() => toggleRecord(record.id)}
                            className="w-full text-left px-4 py-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                  <CalendarClock size={11} />
                                  {new Date(record.record_date || record.created_at || Date.now()).toLocaleDateString(
                                    'en-GB',
                                    { day: 'numeric', month: 'short', year: '2-digit' }
                                  )}
                                </span>
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {record.record_type || 'Routine Check'}
                                </span>
                                {!isEditable(record.created_at) && (
                                  <span
                                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"
                                    title="ZLA Compliance Lock Active"
                                  >
                                    <ShieldAlert size={10} /> Sealed
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-bold text-slate-900 truncate" title={problemTitle}>
                                {problemTitle}
                              </p>
                            </div>

                            <div className="flex items-center gap-4 shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              <div className="flex items-center gap-1.5">
                                <UserRound size={13} className="text-slate-400" />
                                <span className={record.conductor_role === 'EXTERNAL_VET' ? 'text-rose-600 font-bold' : ''}>
                                  {conductorName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-600">
                                <Scale size={13} className="text-slate-400" />
                                {linkedWeight !== 'N/A' ? `${linkedWeight}g` : '--'}
                              </div>
                              <ChevronDown
                                size={16}
                                className={`text-slate-300 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                          </div>

                          {/* Expanded SOAP Details */}
                          {isExpanded && (
                            <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/50 mt-1">
                              {record.conductor_role === 'EXTERNAL_VET' && (
                                <div className="mb-3 bg-rose-50 text-rose-800 p-2.5 rounded-lg border border-rose-100 text-xs font-medium flex items-center gap-2">
                                  <AlertCircle size={13} className="text-rose-500 shrink-0" />
                                  External Consultation at {record.external_vet_clinic || 'External Clinic'}. Logged by internal staff.
                                </div>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 shadow-xs">
                                  <div className="text-[9px] font-black uppercase tracking-widest text-blue-600 mb-1 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> S - Subjective
                                  </div>
                                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                                    {record.soap_subjective || '--'}
                                  </p>
                                </div>

                                <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 shadow-xs">
                                  <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> O - Objective
                                  </div>
                                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                                    {record.soap_objective || '--'}
                                  </p>
                                </div>

                                <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100 shadow-xs md:col-span-2">
                                  <div className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> A - Assessment
                                  </div>
                                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                                    {record.soap_assessment || '--'}
                                  </p>
                                </div>

                                <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100 shadow-xs md:col-span-2">
                                  <div className="text-[9px] font-black uppercase tracking-widest text-purple-600 mb-1 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" /> P - Plan
                                  </div>
                                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                                    {record.soap_plan || '--'}
                                  </p>
                                </div>
                              </div>

                              {/* Action Footer */}
                              <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                                {!canEdit ? (
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                    <ShieldAlert size={11} /> ZLA Compliance Lock Active (Past 30 Days)
                                  </p>
                                ) : (
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => handleEditTrigger(e, record)}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                      title="Edit Record"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleDeleteTrigger(e, record.id, record.weight_log_id || null)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                      title="Delete Record"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}

                                {hasPermission('clinical:prescribe') && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMARHandoff(record.id);
                                    }}
                                    className="text-[9px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 hover:bg-rose-100 transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    <Pill size={11} /> Issue Prescription
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* CONFIRMATION DELETE MODAL */}
      {recordToDelete && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-white max-w-sm w-full rounded-2xl shadow-2xl p-5 border border-slate-200">
            <div className="flex items-center gap-2.5 text-rose-600 mb-3">
              <AlertTriangle size={20} />
              <h3 className="text-sm font-black uppercase tracking-tight">Confirm Deletion</h3>
            </div>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed font-medium">
              Are you sure you want to permanently delete this clinical record? This action will also remove the associated weight log. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={deleteMutation.isPending}
                className="px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => recordToDelete && deleteMutation.mutate(recordToDelete)}
                disabled={deleteMutation.isPending}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {deleteMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* S.O.A.P. DATA ENTRY MODAL */}
      {isSOAPModalOpen && selectedAnimal && (
        <SOAPFormModal
          animalId={selectedAnimal.id}
          animalName={selectedAnimal.name || 'Specimen'}
          staffMembers={staffMembers}
          isStaffLoading={isStaffLoading}
          existingRecord={recordToEdit}
          onClose={() => {
            setIsSOAPModalOpen(false);
            setRecordToEdit(null);
          }}
          onMARTriggered={(clinicalRecordId) => {
            handleMARHandoff(clinicalRecordId);
          }}
        />
      )}

      {/* MAR PRESCRIPTION MODAL */}
      {isMARModalOpen && selectedAnimal && (
        <PrescriptionFormModal
          isOpen={isMARModalOpen}
          onClose={() => {
            setIsMARModalOpen(false);
            setLinkedClinicalIdForMAR(null);
          }}
          initialData={{
            animal_id: selectedAnimal.id,
            clinical_record_id: linkedClinicalIdForMAR || undefined,
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// S.O.A.P. DATA ENTRY MODAL SUB-COMPONENT
// ------------------------------------------------------------------
function SOAPFormModal({
  animalId,
  animalName,
  staffMembers,
  isStaffLoading,
  existingRecord,
  onClose,
  onMARTriggered,
}: {
  animalId: string;
  animalName: string;
  staffMembers: User[];
  isStaffLoading: boolean;
  existingRecord?: EnrichedClinicalRecord | null;
  onClose: () => void;
  onMARTriggered: (recordId: string) => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const isEditMode = Boolean(existingRecord);

  const [recordType, setRecordType] = useState('Routine Check');
  const [title, setTitle] = useState('');
  const [recordDate, setRecordDate] = useState('');
  const [weight, setWeight] = useState('');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [requiresMedication, setRequiresMedication] = useState(false);

  const [conductorType, setConductorType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [conductedBy, setConductedBy] = useState(profile?.id || '');
  const [conductorRole, setConductorRole] = useState('Keeper');
  const [externalVetName, setExternalVetName] = useState('');
  const [externalClinic, setExternalClinic] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (existingRecord) {
      setRecordType(existingRecord.record_type || 'Routine Check');
      setTitle(existingRecord.title || '');
      setSubjective(existingRecord.soap_subjective || '');
      setObjective(existingRecord.soap_objective || '');
      setAssessment(existingRecord.soap_assessment || '');
      setPlan(existingRecord.soap_plan || '');

      if (existingRecord.conductor_role === 'EXTERNAL_VET') {
        setConductorType('EXTERNAL');
        setExternalVetName(existingRecord.external_vet_name || '');
        setExternalClinic(existingRecord.external_vet_clinic || '');
      } else {
        setConductorType('INTERNAL');
        setConductedBy(existingRecord.conducted_by || profile?.id || '');
        setConductorRole(existingRecord.conductor_role || 'Keeper');
      }

      if (existingRecord.record_date) {
        const existingDate = new Date(existingRecord.record_date);
        existingDate.setMinutes(existingDate.getMinutes() - existingDate.getTimezoneOffset());
        setRecordDate(existingDate.toISOString().slice(0, 16));
      }

      const wLog = existingRecord.weight_logs || existingRecord.weight;
      if (wLog) {
        if (Array.isArray(wLog) && wLog.length > 0 && wLog[0]?.weight_grams !== undefined) {
          setWeight(wLog[0].weight_grams.toString());
        } else if (!Array.isArray(wLog) && wLog.weight_grams !== undefined) {
          setWeight(wLog.weight_grams.toString());
        } else {
          setWeight('');
        }
      } else {
        setWeight('');
      }
    } else {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setRecordDate(now.toISOString().slice(0, 16));
      setWeight('');
    }
  }, [existingRecord, profile?.id]);

  const handleSubmitSOAP = async () => {
    setIsSubmitting(true);
    try {
      if (!profile) throw new Error('Authentication error: No active profile found.');

      if (!title.trim()) throw new Error('A Clinical Title/Diagnosis is mandatory.');
      if (!recordDate) throw new Error('Record Date & Time is mandatory.');
      if (!weight) throw new Error('Weight is a mandatory field.');
      if (!subjective.trim()) throw new Error('Subjective observations are mandatory.');
      if (!objective.trim()) throw new Error('Objective exam findings are mandatory.');
      if (!assessment.trim()) throw new Error('Assessment/Diagnosis is mandatory.');
      if (!plan.trim()) throw new Error('Treatment Plan is mandatory.');

      if (conductorType === 'EXTERNAL') {
        if (!externalVetName.trim()) throw new Error('External Vet Name is required.');
        if (!externalClinic.trim()) throw new Error('External Clinic Name is required.');
      }

      const finalConductedBy = conductorType === 'INTERNAL' ? conductedBy : profile.id;
      const finalConductorRole = conductorType === 'INTERNAL' ? conductorRole : 'EXTERNAL_VET';

      const parsedDateObj = new Date(recordDate);
      const parsedRecordDate = parsedDateObj.toISOString();
      const calculatedAmPm = parsedDateObj.getHours() >= 12 ? 'PM' : 'AM';

      const payload = {
        record_type: recordType,
        title: title.trim(),
        record_date: parsedRecordDate,
        soap_subjective: subjective.trim(),
        soap_objective: objective.trim(),
        soap_assessment: assessment.trim(),
        soap_plan: plan.trim(),
        conducted_by: finalConductedBy,
        conductor_role: finalConductorRole,
        external_vet_name: conductorType === 'EXTERNAL' ? externalVetName.trim() : null,
        external_vet_clinic: conductorType === 'EXTERNAL' ? externalClinic.trim() : null,
      };

      let returnedRecordId = existingRecord?.id;

      if (isEditMode && existingRecord) {
        let finalWeightLogId = existingRecord.weight_log_id;

        if (finalWeightLogId) {
          const { error: weightError } = await supabase
            .from('weight_logs')
            .update({
              weight_grams: Number(weight),
              recorded_by: finalConductedBy,
              recorded_at: parsedRecordDate,
              am_pm: calculatedAmPm,
              modified_by: profile.id,
            })
            .eq('id', finalWeightLogId);
          if (weightError) throw new Error(`Failed to update weight log: ${weightError.message}`);
        } else {
          const { data: newWeightData, error: newWeightError } = await supabase
            .from('weight_logs')
            .insert({
              animal_id: animalId,
              weight_grams: Number(weight),
              recorded_by: finalConductedBy,
              recorded_at: parsedRecordDate,
              am_pm: calculatedAmPm,
              created_by: profile.id,
            })
            .select('id')
            .single();
          if (newWeightError) throw new Error(`Failed to create missing weight log: ${newWeightError.message}`);
          finalWeightLogId = newWeightData.id;
        }

        const { error: clinicalError } = await supabase
          .from('clinical_records')
          .update({
            ...payload,
            modified_by: profile.id,
            weight_log_id: finalWeightLogId,
          })
          .eq('id', existingRecord.id);

        if (clinicalError) throw new Error(`Clinical Update Error: ${clinicalError.message}`);
      } else {
        const { data: weightData, error: weightError } = await supabase
          .from('weight_logs')
          .insert({
            animal_id: animalId,
            weight_grams: Number(weight),
            recorded_by: finalConductedBy,
            recorded_at: parsedRecordDate,
            am_pm: calculatedAmPm,
            created_by: profile.id,
          })
          .select('id')
          .single();

        if (weightError) throw new Error(`Failed to log weight: ${weightError.message}`);

        const { data: clinicalData, error: clinicalError } = await supabase
          .from('clinical_records')
          .insert({
            animal_id: animalId,
            ...payload,
            created_by: profile.id,
            modified_by: profile.id,
            weight_log_id: weightData.id,
            is_deleted: false,
          })
          .select('id')
          .single();

        if (clinicalError) throw new Error(`Clinical Insert Error: ${clinicalError.message}`);

        returnedRecordId = clinicalData.id;
      }

      queryClient.invalidateQueries({ queryKey: ['clinical_records', animalId] });
      queryClient.invalidateQueries({ queryKey: ['weight_logs', animalId] });

      if (requiresMedication && returnedRecordId) {
        onMARTriggered(returnedRecordId);
      } else {
        toast.success(isEditMode ? 'Clinical Record updated.' : 'Clinical Record officially sealed.');
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      console.error('[SOAPFormModal] Submit error:', err);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200/80">
        <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Stethoscope className="text-emerald-500" size={16} />
              {isEditMode ? 'Edit Clinical Entry' : 'New Clinical Entry'}
            </h3>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              Patient: {animalName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Clinical Title / Diagnosis <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Suspected Pododermatitis"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                      Record Type <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={recordType}
                      onChange={(e) => setRecordType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="Routine Check">Routine Check</option>
                      <option value="Illness">Illness</option>
                      <option value="Injury">Injury</option>
                      <option value="Surgery">Surgery</option>
                      <option value="Follow up">Follow up</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                      Date &amp; Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={recordDate}
                      onChange={(e) => setRecordDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Current Weight (g) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Scale className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="e.g. 1250"
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                    Auto-syncs to Biometric Weight Ledger
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-2.5 cursor-pointer group w-max">
                    <input
                      type="checkbox"
                      checked={requiresMedication}
                      onChange={(e) => setRequiresMedication(e.target.checked)}
                      className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <Pill size={13} className={requiresMedication ? 'text-rose-500' : 'text-slate-400'} />
                      Medication / MAR Required?
                    </span>
                  </label>
                </div>
              </div>

              {/* Conductor Details Card */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <div className="flex items-center gap-1.5 mb-3">
                  <UserRound size={14} className="text-slate-400" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-700">Conductor Details</h4>
                </div>

                <div className="flex bg-slate-100 p-0.5 rounded-lg mb-3">
                  <button
                    type="button"
                    onClick={() => setConductorType('INTERNAL')}
                    className={`flex-1 py-1 text-[10px] font-black uppercase tracking-widest rounded-md transition-all cursor-pointer ${
                      conductorType === 'INTERNAL' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Internal
                  </button>
                  <button
                    type="button"
                    onClick={() => setConductorType('EXTERNAL')}
                    className={`flex-1 py-1 text-[10px] font-black uppercase tracking-widest rounded-md transition-all cursor-pointer ${
                      conductorType === 'EXTERNAL' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    External Vet
                  </button>
                </div>

                <div className="space-y-3">
                  {conductorType === 'INTERNAL' ? (
                    <>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                          Select Staff Member <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={conductedBy}
                          onChange={(e) => setConductedBy(e.target.value)}
                          disabled={isStaffLoading}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer disabled:opacity-50"
                        >
                          {staffMembers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name} {user.initials ? `(${user.initials})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                          Conductor Role <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={conductorRole}
                          onChange={(e) => setConductorRole(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="Volunteer">Volunteer</option>
                          <option value="Keeper">Keeper</option>
                          <option value="Senior Keeper">Senior Keeper</option>
                          <option value="Head Keeper">Head Keeper / Veterinary Nurse</option>
                          <option value="Owner Director">Owner Director</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-rose-500 mb-1">
                          Attending Vet Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={externalVetName}
                          onChange={(e) => setExternalVetName(e.target.value)}
                          placeholder="e.g. Dr. Sarah Jenkins MRCVS"
                          className="w-full bg-white border border-rose-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-rose-500 mb-1">
                          Clinic Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={externalClinic}
                          onChange={(e) => setExternalClinic(e.target.value)}
                          placeholder="e.g. City Avian & Exotic Vets"
                          className="w-full bg-white border border-rose-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* S.O.A.P. Fields */}
            <div className="lg:col-span-7 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col gap-3.5">
              <div className="flex-1 flex flex-col">
                <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-blue-600 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> S - Subjective (History / Keeper Observations) *
                </label>
                <textarea
                  rows={2}
                  value={subjective}
                  onChange={(e) => setSubjective(e.target.value)}
                  placeholder="Keeper reports bird reluctant to bear weight on left talon..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> O - Objective (Physical Exam / Lesion Findings) *
                </label>
                <textarea
                  rows={2}
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Grade II erythema on plantar pad, no purulent discharge..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> A - Assessment (Clinical Diagnosis) *
                </label>
                <textarea
                  rows={2}
                  value={assessment}
                  onChange={(e) => setAssessment(e.target.value)}
                  placeholder="Early stage pododermatitis, left foot."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-purple-600 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" /> P - Plan (Treatment / Medication Actions) *
                </label>
                <textarea
                  rows={2}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  placeholder="Cleanse with dilute F10. Apply barrier cream. Monitor daily."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Ribbon */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
          {requiresMedication ? (
            <div className="text-[9px] font-bold text-rose-600 uppercase tracking-widest flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-100">
              <Pill size={12} /> MAR Pipeline Active
            </div>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitSOAP}
              disabled={isSubmitting}
              className={`${
                requiresMedication ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
              } text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer disabled:opacity-50`}
            >
              {isSubmitting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : requiresMedication ? (
                <ChevronRight size={13} />
              ) : (
                <ShieldAlert size={13} />
              )}
              {isEditMode ? 'Update Record' : requiresMedication ? 'Seal & Prescribe' : 'Seal Record'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClinicalRecordsModule;