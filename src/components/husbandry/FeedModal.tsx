import React, { useEffect, useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { X, Save, Loader2, Plus, Trash2, Utensils, AlertCircle } from 'lucide-react';
import { toast } from 'sonner'; 
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { feedingService } from '../../services/feedingService';
import { scheduledFeedingService } from '../../services/scheduledFeedingService';
import { Animal } from '../../types';

// --- HELPERS ---
const extractErrorText = (errors: any): string | null => {
  if (!errors) return null;
  const errArray = Array.isArray(errors) ? errors : [errors];
  if (errArray.length === 0) return null;
  const messages = errArray.map((e: any) => {
    if (typeof e === 'string') return e;
    if (e && typeof e.message === 'string') return e.message;
    return null;
  }).filter(Boolean);
  return messages.length > 0 ? messages.join(', ') : null;
};

const FieldError = ({ meta }: { meta: any }) => {
  if (!meta?.errors || meta.errors.length === 0) return null;
  const text = extractErrorText(meta.errors);
  if (!text) return null;
  return (
    <div className="flex items-center gap-1 text-[11px] text-rose-500 mt-1 font-bold">
      <AlertCircle size={12} className="shrink-0" />
      <span>{text}</span>
    </div>
  );
};

const formatLocalDatetime = (dateString?: string) => {
  const d = dateString ? new Date(dateString) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const getDefaultDateTime = (selectedDate?: string) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const localTimeStr = now.toISOString().slice(11, 16);

  if (!selectedDate) return now.toISOString().slice(0, 16);
  if (selectedDate.includes('T')) return formatLocalDatetime(selectedDate);
  return `${selectedDate}T${localTimeStr}`;
};

// --- FORM UI COMPONENTS ---
function FormInput({ 
  field, 
  label, 
  type = 'text', 
  placeholder, 
  rightAddon, 
  step 
}: { 
  field: any; 
  label: string; 
  type?: string; 
  placeholder?: string; 
  rightAddon?: React.ReactNode; 
  step?: string;
}) {
  const hasError = field.state.meta.errors?.length > 0;
  const baseClasses = `w-full p-2.5 bg-slate-50 border rounded-xl outline-none text-sm md:text-xs font-bold text-slate-800 transition-all focus:bg-white focus:ring-4 ${
    hasError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10' : 'border-slate-200 focus:border-slate-400 focus:ring-slate-900/5'
  }`;

  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{label}</label>
      <div className="relative w-full">
        <input
          type={type === 'number' ? 'number' : type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          step={step}
          value={field.state.value ?? ''}
          onBlur={field.handleBlur}
          onChange={(e) => {
            if (type === 'number') {
              field.handleChange(e.target.value === '' ? undefined : parseFloat(e.target.value));
            } else {
              field.handleChange(e.target.value);
            }
          }}
          placeholder={placeholder}
          className={baseClasses}
          style={rightAddon ? { paddingRight: '2.5rem' } : undefined}
        />
        {rightAddon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
            {rightAddon}
          </div>
        )}
      </div>
      <FieldError meta={field.state.meta} />
    </div>
  );
}

function FormSelect({ 
  field, 
  label, 
  options, 
  placeholder 
}: { 
  field: any; 
  label: string; 
  options: { value: string | number; label: string }[]; 
  placeholder?: string; 
}) {
  const hasError = field.state.meta.errors?.length > 0;
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{label}</label>
      <select
        value={field.state.value ?? ''}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        className={`w-full p-2.5 bg-slate-50 border rounded-xl outline-none text-sm md:text-xs font-bold text-slate-800 transition-all focus:bg-white focus:ring-4 cursor-pointer appearance-none ${
          hasError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10' : 'border-slate-200 focus:border-slate-400 focus:ring-slate-900/5'
        }`}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt, i) => (
          <option key={i} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <FieldError meta={field.state.meta} />
    </div>
  );
}

// --- SCHEMA VALIDATION ---
const feedItemSchema = z.object({
  id: z.string().optional(),
  food_item: z.string().optional(),
  feed_method: z.string().optional(),
  quantity: z.number().min(0, 'Cannot be negative').optional(),
  unit: z.enum(['grams', 'whole_item']),
  calci_dust_added: z.boolean().default(false),
});

const feedGroupSchema = z.object({
  recorded_by: z.string().uuid('ZLA COMPLIANCE: An active staff member must be selected.'),
  recorded_at: z.string().min(1, 'Date and Time required'),
  outcome: z.enum(['EATEN', 'REFUSED', 'FASTING', 'NOT_CAST', 'REGURGITATED']).default('EATEN'),
  items: z.array(feedItemSchema).min(1, 'At least one item component required'),
}).superRefine((data, ctx) => {
  if (data.outcome === 'EATEN') {
    data.items.forEach((item, index) => {
      if (!item.food_item || item.food_item.trim() === '') {
        ctx.addIssue({ 
          code: z.ZodIssueCode.custom, 
          message: 'Food item is required when Eaten', 
          path: ['items', index, 'food_item'] 
        });
      }
      if (item.quantity === undefined || item.quantity <= 0) {
        ctx.addIssue({ 
          code: z.ZodIssueCode.custom, 
          message: 'Quantity must be > 0', 
          path: ['items', index, 'quantity'] 
        });
      }
    });
  }
});

type FeedFormValues = z.infer<typeof feedGroupSchema>;

interface FeedModalProps { 
  isOpen: boolean; 
  onClose: () => void; 
  animalId: string; 
  initialData?: any; 
  scheduledFeed?: any; 
  selectedDate?: string; 
}

export function FeedModal({ 
  isOpen, 
  onClose, 
  animalId, 
  initialData, 
  scheduledFeed, 
  selectedDate 
}: FeedModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  // 1. Resolve Animal Context (Cached or Direct Fetch Fallback)
  const cachedAnimals = queryClient.getQueryData<Animal[]>(['animals', 'dashboard']) || [];
  const cachedAnimal = cachedAnimals.find(a => a.id === animalId);

  const { data: fetchedAnimal } = useQuery({
    queryKey: ['animal', animalId],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').eq('id', animalId).single();
      if (error) throw error;
      return data as Animal;
    },
    enabled: isOpen && !cachedAnimal && Boolean(animalId),
    staleTime: 1000 * 60 * 10
  });

  const animal = cachedAnimal || fetchedAnimal;
  const animalCat = animal?.category?.toUpperCase().trim() || '';

  // 2. Data Queries
  const { data: activeStaff = [] } = useQuery({
    queryKey: ['active-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, initials')
        .eq('is_active', true)
        .eq('is_deleted', false);
      if (error) throw error;
      return data || [];
    },
    staleTime: 0,
    gcTime: 1209600000,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  const { data: opLists = [] } = useQuery({
    queryKey: ['operational_lists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operational_lists')
        .select('name, category, animal_category')
        .eq('is_deleted', false);
      if (error) throw error;
      return data || [];
    },
    staleTime: 0,
    gcTime: 1209600000,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  // 3. Dynamic Taxonomy Options
  const foodOptions = useMemo(() => opLists.filter(l => {
    if (l.category?.toLowerCase() !== 'food_type') return false;
    const targetCategory = l.animal_category?.toUpperCase().trim();
    return targetCategory && animalCat ? targetCategory.includes(animalCat) : true;
  }).map(f => ({ value: f.name, label: f.name })), [opLists, animalCat]);

  const methodOptions = useMemo(() => opLists.filter(l => {
    if (l.category?.toLowerCase() !== 'feed_method') return false;
    const targetCategory = l.animal_category?.toUpperCase().trim();
    return targetCategory && animalCat ? targetCategory.includes(animalCat) : true;
  }).map(f => ({ value: f.name, label: f.name })), [opLists, animalCat]);

  // 4. Submission Mutation
  const insertFeedMutation = useMutation({
    mutationFn: async (values: FeedFormValues) => {
      const payloads = values.items.map(item => ({
        id: item.id || crypto.randomUUID(),
        animal_id: animalId,
        recorded_by: values.recorded_by,
        recorded_at: new Date(values.recorded_at).toISOString(),
        created_by: profile?.id,
        food_item: item.food_item || null,
        feed_method: item.feed_method || null,
        quantity: item.quantity || 0,
        unit: item.unit,
        calci_dust_added: item.calci_dust_added,
        outcome: values.outcome,
        schedule_id: scheduledFeed?.id || null
      }));

      if (scheduledFeed?.id) {
        await scheduledFeedingService.resolveScheduledFeed(scheduledFeed.id, values.outcome as any, payloads[0] as any);
        if (payloads.length > 1) {
          await feedingService.insertFeedLog(payloads.slice(1));
        }
        return payloads;
      } else {
        return await feedingService.insertFeedLog(payloads);
      }
    },
    onSuccess: () => {
      toast.success(
        scheduledFeed 
          ? 'Schedule resolved & logged!' 
          : initialData 
            ? 'Feed updated successfully' 
            : 'Feed logged successfully'
      );
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'next_feeds'] });
      onClose();
    },
    onError: (error: any) => toast.error(`Failed to log feed: ${error.message}`),
  });

  // 5. TanStack Form Setup
  const form = useForm<FeedFormValues>({
    defaultValues: {
      recorded_by: initialData?.recorded_by || profile?.id || '',
      recorded_at: initialData?.recorded_at 
        ? formatLocalDatetime(initialData.recorded_at) 
        : getDefaultDateTime(selectedDate),
      outcome: 'EATEN',
      items: [{ food_item: '', feed_method: '', quantity: 1, unit: 'whole_item', calci_dust_added: false }]
    },
    validators: { onSubmit: feedGroupSchema },
    onSubmit: async ({ value }) => insertFeedMutation.mutate(value),
  });

  // 6. Reset and Rehydrate on Open
  useEffect(() => {
    if (isOpen) {
      form.reset();
      if (scheduledFeed) {
        const isFasting = scheduledFeed.notes === 'FAST DAY / NOT REQUIRED' || scheduledFeed.food_type === 'NOT REQUIRED';
        form.setFieldValue('recorded_by', profile?.id || '');
        form.setFieldValue('recorded_at', scheduledFeed.scheduled_date ? `${scheduledFeed.scheduled_date}T12:00` : getDefaultDateTime(selectedDate));
        form.setFieldValue('outcome', isFasting ? 'FASTING' : 'EATEN');
        form.setFieldValue('items', [{
          id: crypto.randomUUID(),
          food_item: isFasting ? '' : (scheduledFeed.food_type || ''),
          feed_method: scheduledFeed.presentation_method || '',
          quantity: scheduledFeed.quantity || 0,
          unit: (scheduledFeed.quantity_unit === 'grams' || scheduledFeed.quantity_unit === 'g') ? 'grams' : 'whole_item',
          calci_dust_added: scheduledFeed.supplements === 'Calci-Dust' || false,
        }]);
      } else if (initialData) {
        form.setFieldValue('recorded_by', initialData.recorded_by || profile?.id || '');
        form.setFieldValue('recorded_at', formatLocalDatetime(initialData.recorded_at || initialData.time || initialData.log_date));
        form.setFieldValue('outcome', initialData.outcome || 'EATEN');
        form.setFieldValue('items', [{
          id: initialData.id,
          food_item: initialData.food_item || '',
          feed_method: initialData.feed_method || '',
          quantity: initialData.quantity ?? initialData.quantity_consumed ?? initialData.food_consumed_g ?? initialData.quantity_offered ?? 1,
          unit: (initialData.unit === 'grams' || initialData.unit === 'g') ? 'grams' : 'whole_item',
          calci_dust_added: initialData.calci_dust_added || false,
        }]);
      } else {
        form.setFieldValue('recorded_by', profile?.id || '');
        form.setFieldValue('recorded_at', getDefaultDateTime(selectedDate));
        form.setFieldValue('outcome', 'EATEN');
        form.setFieldValue('items', [{ food_item: '', feed_method: '', quantity: 1, unit: 'whole_item', calci_dust_added: false }]);
      }
    }
  }, [isOpen, scheduledFeed, initialData, selectedDate, profile?.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col border-0 md:border md:border-slate-200 relative">
        
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-50">
              <Utensils size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-black text-slate-900 uppercase tracking-widest leading-tight">
                {scheduledFeed ? 'Resolve Schedule' : initialData ? 'Edit Feed' : 'Log Feed'}
              </h2>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-tight">
                {animal?.name || 'Loading animal...'}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* FORM BODY */}
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            form.handleSubmit(); 
          }} 
          className="p-5 overflow-y-auto custom-scrollbar bg-white flex-1 relative space-y-5"
        >
          {/* Keeper and Timestamp Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <form.Field name="recorded_at">
              {(field) => <FormInput field={field} label="Date & Time" type="datetime-local" />}
            </form.Field>

            <form.Field name="recorded_by">
              {(field) => (
                <FormSelect 
                  field={field} 
                  label="Conducted By *" 
                  placeholder="-- Select Keeper --"
                  options={activeStaff.map((s: any) => ({ 
                    value: s.id, 
                    label: `${s.name}${s.initials ? ` (${s.initials})` : ''}` 
                  }))} 
                />
              )}
            </form.Field>
          </div>

          {/* OUTCOME SELECTOR */}
          <form.Field name="outcome">
            {(field) => {
              const options = [
                { value: 'EATEN', label: 'Eaten', color: 'bg-emerald-500 text-white' },
                { value: 'REFUSED', label: 'Refused', color: 'bg-rose-500 text-white' },
                { value: 'FASTING', label: 'Fasting', color: 'bg-amber-500 text-white' },
                { value: 'NOT_CAST', label: 'Not Cast', color: 'bg-purple-500 text-white' }
              ];
              return (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    Diet Outcome
                  </label>
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                    {options.map(opt => {
                      const isSelected = field.state.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.handleChange(opt.value as any)}
                          className={`flex-1 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all ${
                            isSelected 
                              ? `${opt.color} shadow-sm scale-100` 
                              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 scale-95'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          </form.Field>

          <hr className="border-slate-100" />

          {/* FEED ITEMS ARRAY */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                Feed Components
              </span>
              <form.Field name="items">
                {(field) => (
                  <button
                    type="button"
                    onClick={() => field.pushValue({ 
                      id: crypto.randomUUID(), 
                      food_item: '', 
                      feed_method: '', 
                      quantity: 1, 
                      unit: 'whole_item', 
                      calci_dust_added: false 
                    })}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors bg-amber-50 text-amber-600 hover:bg-amber-100"
                  >
                    <Plus size={12} /> Add Component
                  </button>
                )}
              </form.Field>
            </div>

            <form.Field name="items">
              {(itemsField) => (
                <div className="space-y-4">
                  {itemsField.state.value.map((_, i) => (
                    <div 
                      key={i} 
                      className="relative space-y-3 border-l-2 border-slate-200 pl-4 py-1 hover:border-amber-400 transition-colors group"
                    >
                      {itemsField.state.value.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => itemsField.removeValue(i)} 
                          className="absolute -top-1 right-0 text-slate-300 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-lg transition-colors md:opacity-0 group-hover:opacity-100"
                          title="Remove Component"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <form.Field name={`items[${i}].food_item` as const}>
                          {(subField) => (
                            <FormSelect 
                              field={subField} 
                              label={`Food Item (${i + 1})`} 
                              placeholder="-- Select Food --" 
                              options={foodOptions} 
                            />
                          )}
                        </form.Field>

                        <form.Field name={`items[${i}].feed_method` as const}>
                          {(subField) => (
                            <FormSelect 
                              field={subField} 
                              label="Method" 
                              placeholder="-- Select Method --" 
                              options={methodOptions} 
                            />
                          )}
                        </form.Field>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <form.Field name={`items[${i}].quantity` as const}>
                          {(subField) => (
                            <FormInput 
                              field={subField} 
                              label="Quantity" 
                              type="number" 
                              step="0.1" 
                            />
                          )}
                        </form.Field>

                        <form.Field name={`items[${i}].unit` as const}>
                          {(subField) => (
                            <FormSelect 
                              field={subField} 
                              label="Unit" 
                              options={[
                                { value: 'whole_item', label: 'Items' }, 
                                { value: 'grams', label: 'Grams' }
                              ]} 
                            />
                          )}
                        </form.Field>
                      </div>

                      <div className="pt-0.5">
                        <form.Field name={`items[${i}].calci_dust_added` as const}>
                          {(subField) => (
                            <label className="flex items-center gap-2 cursor-pointer w-fit select-none">
                              <input 
                                type="checkbox" 
                                checked={Boolean(subField.state.value)} 
                                onChange={(e) => subField.handleChange(e.target.checked)} 
                                className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500 cursor-pointer" 
                              />
                              <span className="text-[10px] md:text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                                Add Calci-Dust / Supplement
                              </span>
                            </label>
                          )}
                        </form.Field>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </form.Field>
            
            {/* Form Validation Errors */}
            <form.Subscribe 
              selector={(state) => state.errorMap} 
              children={(errorMap) => {
                const text = extractErrorText(errorMap?.onSubmit);
                return text ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-600">
                    <AlertCircle size={15} className="shrink-0" />
                    <p className="text-xs font-bold">{text}</p>
                  </div>
                ) : null;
              }} 
            />
          </div>
        </form>

        {/* FOOTER */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end bg-white gap-3 shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>

          <form.Subscribe selector={(state) => [state.isSubmitting]}>
            {([isSubmitting]) => (
              <button
                type="button"
                onClick={() => form.handleSubmit()}
                disabled={insertFeedMutation.isPending || isSubmitting}
                className="flex items-center justify-center gap-2 px-7 py-2.5 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md disabled:opacity-50 bg-amber-600 hover:bg-amber-500"
              >
                {(isSubmitting || insertFeedMutation.isPending) ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                <span>
                  {scheduledFeed ? 'Log & Resolve' : initialData ? 'Update Feed' : 'Save Feed'}
                </span>
              </button>
            )}
          </form.Subscribe>
        </div>

      </div>
    </div>
  );
}

export default FeedModal;