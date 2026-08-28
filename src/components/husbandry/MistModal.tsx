import { useEffect, useState, type FormEvent } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import * as v from 'valibot';
import { X, Save, Loader2, Droplets, Sun, Moon, Users, Trash2 } from 'lucide-react';
import { toast } from 'sonner'; 
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { mistService } from '../../services/mistService';
import type { Animal } from '../../types';

interface ActiveStaffUser {
  id: string;
  name: string;
  initials?: string | null;
}

const MistSchema = v.object({
  recorded_by: v.pipe(v.string(), v.minLength(1, 'ZLA COMPLIANCE: An active staff member must be selected.')),
  recorded_at: v.pipe(v.string(), v.minLength(1, 'Date and time required')),
  mist_level: v.picklist(['LIGHT', 'MEDIUM', 'HEAVY']),
  am_pm: v.picklist(['AM', 'PM']),
  notes: v.optional(v.string()),
});

type MistFormValues = v.InferOutput<typeof MistSchema>;

export interface MistModalProps { 
  isOpen: boolean; 
  onClose: () => void; 
  animalId: string; 
  animal?: Animal | null; 
  initialData?: any; 
  selectedDate?: string; 
}

const extractErrorText = (errors: unknown): string | null => {
  if (!errors) return null;
  const errArray = Array.isArray(errors) ? errors : [errors];
  if (errArray.length === 0) return null;
  const messages = errArray.map((e) => {
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
      return (e as { message: string }).message;
    }
    return null;
  }).filter(Boolean);
  return messages.length > 0 ? messages.join(', ') : null;
};

const FieldError = ({ meta }: { meta: { errors?: unknown[] } }) => {
  if (!meta.errors || meta.errors.length === 0) return null;
  const text = extractErrorText(meta.errors);
  if (!text) return null;
  return <p className="text-[10px] text-rose-500 mt-0.5 font-bold text-left">{text}</p>;
};

const formatLocalDatetime = (dateString?: string): string => {
  const d = dateString ? new Date(dateString) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
};

const getDefaultDateTime = (selectedDate?: string): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localNow = new Date(now.getTime() - offset);
  const localTimeStr = localNow.toISOString().slice(11, 16); 
  return selectedDate ? `${selectedDate}T${localTimeStr}` : localNow.toISOString().slice(0, 16);
};

const normalizeMistLevel = (val?: string): 'LIGHT' | 'MEDIUM' | 'HEAVY' => {
  if (!val) return 'MEDIUM';
  const upper = val.toUpperCase().trim();
  if (upper === 'MODERATE' || upper === 'MEDIUM') return 'MEDIUM';
  if (upper === 'LIGHT') return 'LIGHT';
  if (upper === 'HEAVY' || upper === 'DRENCH') return 'HEAVY';
  return 'MEDIUM';
};

function FormInput({ field, label, type = 'text', placeholder }: { field: any; label: string; type?: string; placeholder?: string }) {
  const hasError = Boolean(field.state.meta.errors?.length);
  return (
    <div className="flex flex-col gap-1 w-full text-left">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-left">{label}</label>
      <input
        type={type}
        value={field.state.value ?? ''}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full p-2.5 bg-slate-50 border rounded-xl outline-none text-xs font-bold text-slate-800 transition-all focus:bg-white focus:ring-4 ${
          hasError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10' : 'border-slate-200 focus:border-slate-400 focus:ring-slate-900/5'
        }`}
      />
      <FieldError meta={field.state.meta} />
    </div>
  );
}

function FormSelect({ field, label, options, placeholder }: { field: any; label: string; options: { value: string | number; label: string }[]; placeholder?: string }) {
  const hasError = Boolean(field.state.meta.errors?.length);
  return (
    <div className="flex flex-col gap-1 w-full text-left">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-left">{label}</label>
      <select
        value={field.state.value ?? ''}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        className={`w-full p-2.5 bg-slate-50 border rounded-xl outline-none text-xs font-bold text-slate-800 transition-all focus:bg-white focus:ring-4 cursor-pointer appearance-none ${
          hasError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10' : 'border-slate-200 focus:border-slate-400 focus:ring-slate-900/5'
        }`}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <FieldError meta={field.state.meta} />
    </div>
  );
}

export function MistModal({ isOpen, onClose, animalId, animal: passedAnimal, initialData, selectedDate }: MistModalProps) {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const { data: queriedAnimal } = useQuery({
    queryKey: ['animal', animalId],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').eq('id', animalId).single();
      if (error) throw error;
      return data as Animal;
    },
    enabled: isOpen && Boolean(animalId) && !passedAnimal,
    initialData: () => {
      if (passedAnimal) return passedAnimal;
      const cached = queryClient.getQueryData<Animal[]>(['animals', 'husbandry']) 
        || queryClient.getQueryData<Animal[]>(['animals', 'dashboard'])
        || queryClient.getQueryData<Animal[]>(['animals']);
      return cached?.find(a => a.id === animalId);
    }
  });

  const animal = passedAnimal || queriedAnimal;
  const isGroupMob = animal?.record_type === 'GROUP';

  const { data: activeStaff = [] } = useQuery<ActiveStaffUser[]>({
    queryKey: ['active-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, initials')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data || []) as ActiveStaffUser[];
    },
    staleTime: 0, 
    gcTime: 1209600000, 
    networkMode: 'offlineFirst'
  });

  const insertMistMutation = useMutation({
    mutationFn: async (values: MistFormValues) => {
      return await mistService.insertMistLog({
        id: initialData?.id,
        animal_id: animalId,
        recorded_by: values.recorded_by,
        recorded_at: new Date(values.recorded_at).toISOString(),
        created_by: profile?.id || user?.id || null,
        mist_level: values.mist_level,
        am_pm: values.am_pm,
        notes: values.notes?.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(initialData ? 'Misting routine updated' : 'Misting routine logged');
      queryClient.invalidateQueries({ queryKey: ['mist_logs'] });
      queryClient.invalidateQueries({ queryKey: ['strict_logs'] });
      queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
      onClose();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Database error';
      console.error('[MistModal Submission Error]:', error);
      toast.error(`Failed to log misting: ${msg}`);
    },
  });

  const deleteMistMutation = useMutation({
    mutationFn: async () => {
      if (!initialData?.id) throw new Error('No record ID to delete');
      return await mistService.deleteMistLog(initialData.id);
    },
    onSuccess: () => {
      toast.success('Misting routine deleted');
      queryClient.invalidateQueries({ queryKey: ['mist_logs'] });
      queryClient.invalidateQueries({ queryKey: ['strict_logs'] });
      queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
      onClose();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Database error';
      toast.error(`Failed to delete record: ${msg}`);
    },
  });

  const form = useForm<MistFormValues>({
    defaultValues: {
      recorded_by: initialData?.recorded_by || profile?.id || user?.id || '',
      recorded_at: initialData?.recorded_at ? formatLocalDatetime(initialData.recorded_at) : getDefaultDateTime(selectedDate),
      mist_level: normalizeMistLevel(initialData?.mist_level),
      am_pm: (initialData?.am_pm?.toUpperCase() as 'AM' | 'PM') || (new Date().getHours() < 12 ? 'AM' : 'PM'),
      notes: initialData?.notes || '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(MistSchema, value);
        if (!result.success) {
          return result.issues[0]?.message || 'Please complete all required fields';
        }
        return undefined;
      }
    },
    onSubmit: async ({ value }) => {
      insertMistMutation.mutate(value);
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
      setShowDeleteConfirm(false);
      if (initialData) {
        form.setFieldValue('recorded_by', initialData.recorded_by || profile?.id || user?.id || '');
        form.setFieldValue('recorded_at', formatLocalDatetime(initialData.recorded_at || initialData.log_date));
        form.setFieldValue('mist_level', normalizeMistLevel(initialData.mist_level));
        form.setFieldValue('am_pm', (initialData.am_pm?.toUpperCase() as 'AM' | 'PM') || (new Date().getHours() < 12 ? 'AM' : 'PM'));
        form.setFieldValue('notes', initialData.notes || '');
      } else {
        form.setFieldValue('recorded_by', profile?.id || user?.id || '');
        form.setFieldValue('recorded_at', getDefaultDateTime(selectedDate));
        form.setFieldValue('mist_level', 'MEDIUM');
        form.setFieldValue('am_pm', new Date().getHours() < 12 ? 'AM' : 'PM');
        form.setFieldValue('notes', '');
      }
    }
  }, [isOpen, initialData, selectedDate, profile?.id, user?.id, form]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center p-0 md:p-4 bg-slate-950/70 backdrop-blur-md font-sans text-left">
      <div className="bg-white w-full h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col border-0 md:border md:border-slate-200 relative text-left">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 text-left">
          <div className="flex items-center gap-3 text-left">
            <div className={`p-2 rounded-xl ${isGroupMob ? 'bg-blue-50 text-blue-600' : 'bg-cyan-50 text-cyan-600'}`}>
              {isGroupMob ? <Users size={18} /> : <Droplets size={18} />}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-tight text-left">
                  {initialData ? 'Edit Misting Routine' : 'Log Misting Routine'}
                </h2>
                {isGroupMob && (
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                    Whole Enclosure
                  </span>
                )}
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-0.5 text-left">
                Specimen &bull; <span className="text-cyan-700 font-bold">{animal?.name || 'Unknown Specimen'}</span>
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form 
          onSubmit={(e: FormEvent) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            form.handleSubmit(); 
          }} 
          className="p-5 overflow-y-auto custom-scrollbar bg-white flex-1 relative space-y-4 text-left"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
            <form.Field name="recorded_at">
              {(field) => <FormInput field={field} label="Date & Time" type="datetime-local" />}
            </form.Field>
            
            <form.Field name="recorded_by">
              {(field) => (
                <FormSelect 
                  field={field} 
                  label="Conducted By *" 
                  placeholder="-- Select Keeper --"
                  options={activeStaff.map((s) => ({ value: s.id, label: `${s.name} (${s.initials || '?'})` }))} 
                />
              )}
            </form.Field>
          </div>

          {/* Shift Selector */}
          <form.Field name="am_pm">
            {(field) => (
              <div className="space-y-1 text-left">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 text-left">
                  Shift / Routine Window
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => field.handleChange('AM')}
                    className={`py-2 px-3 rounded-xl border-2 font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      field.state.value === 'AM'
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-800 shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                  >
                    <Sun size={14} className={field.state.value === 'AM' ? 'text-cyan-600' : 'text-slate-400'} />
                    AM Spray
                  </button>
                  <button
                    type="button"
                    onClick={() => field.handleChange('PM')}
                    className={`py-2 px-3 rounded-xl border-2 font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      field.state.value === 'PM'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                  >
                    <Moon size={14} className={field.state.value === 'PM' ? 'text-indigo-600' : 'text-slate-400'} />
                    PM Spray
                  </button>
                </div>
              </div>
            )}
          </form.Field>

          {/* Misting Intensity */}
          <form.Field name="mist_level">
            {(field) => {
              const options: { value: 'LIGHT' | 'MEDIUM' | 'HEAVY'; label: string; desc: string }[] = [
                { value: 'LIGHT', label: 'Light Mist', desc: 'Fine spray / humidity boost' },
                { value: 'MEDIUM', label: 'Medium Mist', desc: 'Standard hydration pass' },
                { value: 'HEAVY', label: 'Heavy Spray', desc: 'Full enclosure & substrate soak' },
              ];
              return (
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 text-left">
                    Misting Intensity *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {options.map((opt) => {
                      const isSelected = field.state.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.handleChange(opt.value)}
                          className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'border-cyan-500 bg-cyan-50/80 shadow-xs text-cyan-900 ring-2 ring-cyan-500/20'
                              : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className="text-xs font-black uppercase tracking-wider">{opt.label}</span>
                            <Droplets size={14} className={isSelected ? 'text-cyan-600' : 'text-slate-300'} />
                          </div>
                          <p className="text-[9px] font-medium text-slate-500 leading-tight">{opt.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          </form.Field>

          {/* Notes */}
          <form.Field name="notes">
            {(field) => (
              <div className="space-y-1 text-left">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 text-left">
                  Observations / Enclosure Notes
                </label>
                <textarea
                  rows={2}
                  value={field.state.value ?? ''}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Substrate dampness, shedding condition, humidity gauge..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 resize-none shadow-xs"
                />
              </div>
            )}
          </form.Field>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between bg-white shrink-0 text-left">
          <div className="text-left">
            {initialData?.id && (
              showDeleteConfirm ? (
                <div className="flex items-center gap-2 animate-in fade-in duration-200">
                  <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Confirm delete?</span>
                  <button
                    type="button"
                    onClick={() => deleteMistMutation.mutate()}
                    disabled={deleteMistMutation.isPending}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {deleteMistMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Yes, Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleteMistMutation.isPending || insertMistMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-widest text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <form.Subscribe
              selector={(state) => [state.isSubmitting]}
              children={([isSubmitting]) => (
                <button
                  type="button"
                  onClick={form.handleSubmit}
                  disabled={insertMistMutation.isPending || isSubmitting || deleteMistMutation.isPending}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md disabled:opacity-50 bg-cyan-600 hover:bg-cyan-500 cursor-pointer active:scale-95"
                >
                  {(isSubmitting || insertMistMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {initialData ? 'Update Routine' : 'Save Routine'}
                </button>
              )}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

export default MistModal;