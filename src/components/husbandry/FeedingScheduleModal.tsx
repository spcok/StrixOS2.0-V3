import { useEffect, useMemo, useState } from 'react';
import { useForm, type FieldApi } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import * as v from 'valibot';
import { X, Save, Loader2, Calendar, Utensils, Repeat, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import type { Animal, FeedingSchedule, OperationalDietItem } from '../../types';

export interface FeedingScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCategory?: string;
  animalId?: string | null;
  initialData?: FeedingSchedule | null;
}

const DAYS_OF_WEEK = [
  { key: 'MON', label: 'Mon' },
  { key: 'TUE', label: 'Tue' },
  { key: 'WED', label: 'Wed' },
  { key: 'THU', label: 'Thu' },
  { key: 'FRI', label: 'Fri' },
  { key: 'SAT', label: 'Sat' },
  { key: 'SUN', label: 'Sun' },
] as const;

interface ScheduleFormValues {
  animal_id: string;
  food_type: string;
  quantity: number;
  quantity_unit: string;
  start_date: string;
  interval_value: number;
  interval_unit: 'days' | 'weeks';
  days_of_week: string[];
  calci_dust: boolean;
  vitamins: boolean;
  notes?: string;
}

const ScheduleSchema = v.object({
  animal_id: v.pipe(v.string(), v.minLength(1, 'Target specimen is required')),
  food_type: v.pipe(v.string(), v.minLength(1, 'Food item / diet type required')),
  quantity: v.pipe(v.number(), v.minValue(0.1, 'Quantity must be greater than 0')),
  quantity_unit: v.pipe(v.string(), v.minLength(1, 'Quantity unit is required')),
  start_date: v.pipe(v.string(), v.minLength(1, 'Start date required')),
  interval_value: v.pipe(v.number(), v.minValue(1, 'Interval must be at least 1')),
  interval_unit: v.picklist(['days', 'weeks']),
  days_of_week: v.array(v.string()),
  calci_dust: v.boolean(),
  vitamins: v.boolean(),
  notes: v.optional(v.string()),
});

const getLocalDateString = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function FeedingScheduleModal({
  isOpen,
  onClose,
  activeCategory = 'EXOTIC',
  animalId: propAnimalId,
  initialData,
}: FeedingScheduleModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [selectedDays, setSelectedDays] = useState<string[]>(['MON', 'THU']);

  // Specimen Selector Query
  const { data: animals = [] } = useQuery<Animal[]>({
    queryKey: ['animals', 'dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('*')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return (data || []) as Animal[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const filteredAnimals = useMemo(() => {
    if (!activeCategory || activeCategory === 'ALL' || activeCategory === 'ARCHIVED') return animals;
    return animals.filter((a) => a.category === activeCategory);
  }, [animals, activeCategory]);

  // Standard Diet Library Items
  const { data: dietItems = [] } = useQuery<OperationalDietItem[]>({
    queryKey: ['operational_lists', 'food_item'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operational_lists')
        .select('*')
        .eq('category', 'food_item')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data || []) as OperationalDietItem[];
    },
    staleTime: 1000 * 60 * 15,
  });

  const saveScheduleMutation = useMutation({
    mutationFn: async (values: ScheduleFormValues) => {
      const result = v.safeParse(ScheduleSchema, values);
      if (!result.success) {
        throw new Error(result.issues[0]?.message || 'Validation failed');
      }

      const multiplier = values.interval_unit === 'weeks' ? 7 : 1;
      const stepDays = values.interval_value * multiplier;

      // Pack metadata into JSON structure
      const supplementsPayload = JSON.stringify({
        calci_dust: values.calci_dust,
        vitamins: values.vitamins,
        days: values.days_of_week,
        interval_value: values.interval_value,
        interval_unit: values.interval_unit,
      });

      if (initialData?.id) {
        const { error } = await supabase
          .from('feeding_schedules')
          .update({
            animal_id: values.animal_id,
            food_type: values.food_type,
            quantity: values.quantity,
            quantity_unit: values.quantity_unit,
            scheduled_date: values.start_date,
            interval_days: stepDays,
            supplements: supplementsPayload,
            notes: values.notes?.trim() || null,
          })
          .eq('id', initialData.id);

        if (error) throw error;
        return;
      }

      // Generate next occurrences across a 60-day window
      const generatedRecords = [];
      const [sY, sM, sD] = values.start_date.split('-').map(Number);
      const cursor = new Date(sY!, sM! - 1, sD!);
      const horizonDays = 60;

      for (let i = 0; i < horizonDays; i += stepDays) {
        const d = new Date(cursor.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = getLocalDateString(d);

        const recId =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2);

        generatedRecords.push({
          id: recId,
          animal_id: values.animal_id,
          food_type: values.food_type,
          quantity: values.quantity,
          quantity_unit: values.quantity_unit,
          scheduled_date: dateStr,
          interval_days: stepDays,
          supplements: supplementsPayload,
          status: 'PENDING',
          is_deleted: false,
          created_by: profile?.id || null,
          notes: values.notes?.trim() || null,
        });
      }

      const { error } = await supabase.from('feeding_schedules').insert(generatedRecords);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(initialData?.id ? 'Feeding schedule updated' : 'Diet routine generated successfully');
      queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'next_feeds'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to commit schedule';
      toast.error(msg);
    },
  });

  const form = useForm<ScheduleFormValues>({
    defaultValues: {
      animal_id: initialData?.animal_id || propAnimalId || '',
      food_type: initialData?.food_type || 'Mice - Adult',
      quantity: initialData?.quantity || 1,
      quantity_unit: initialData?.quantity_unit || 'item',
      start_date: initialData?.scheduled_date ? initialData.scheduled_date.split('T')[0]! : getLocalDateString(),
      interval_value: initialData?.interval_days ? (initialData.interval_days % 7 === 0 ? initialData.interval_days / 7 : initialData.interval_days) : 1,
      interval_unit: initialData?.interval_days && initialData.interval_days % 7 === 0 ? 'weeks' : 'days',
      days_of_week: ['MON', 'THU'],
      calci_dust: false,
      vitamins: false,
      notes: initialData?.notes || '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(ScheduleSchema, value);
        if (!result.success) {
          return result.issues[0]?.message || 'Please complete all required fields';
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      await saveScheduleMutation.mutateAsync(value);
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
      const targetId = initialData?.animal_id || propAnimalId || '';
      form.setFieldValue('animal_id', targetId);
      form.setFieldValue('food_type', initialData?.food_type || 'Mice - Adult');
      form.setFieldValue('quantity', initialData?.quantity || 1);
      form.setFieldValue('quantity_unit', initialData?.quantity_unit || 'item');
      form.setFieldValue(
        'start_date',
        initialData?.scheduled_date ? initialData.scheduled_date.split('T')[0]! : getLocalDateString()
      );
      form.setFieldValue('notes', initialData?.notes || '');
    }
  }, [isOpen, initialData, propAnimalId, form]);

  const toggleDay = (day: string) => {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    setSelectedDays(next);
    form.setFieldValue('days_of_week', next);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden border border-slate-200/80">
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center font-black shadow-xs shrink-0">
              <Calendar size={18} />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
                {initialData?.id ? 'Edit Feeding Schedule' : 'Schedule Diet Routine'}
              </h2>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Cyclical Nutrition Matrix
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="p-4 sm:p-5 space-y-3.5 sm:space-y-4 overflow-y-auto custom-scrollbar flex-1"
        >
          {/* Specimen Target Selector */}
          <form.Field name="animal_id">
            {(field: FieldApi<ScheduleFormValues, 'animal_id', any, any>) => (
              <div className="space-y-1">
                <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Target Specimen *
                </label>
                <select
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                >
                  <option value="" disabled>-- Select Specimen --</option>
                  {filteredAnimals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.species || 'Unknown'}) {a.ring_number ? `• ${a.ring_number}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>

          {/* Food Item & Quantity Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2 space-y-1">
              <form.Field name="food_type">
                {(field: FieldApi<ScheduleFormValues, 'food_type', any, any>) => (
                  <div>
                    <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                      Food Item *
                    </label>
                    <input
                      type="text"
                      list="diet-options"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g. Quail, Mice - Adult"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <datalist id="diet-options">
                      {dietItems.map((d) => (
                        <option key={d.id} value={d.name} />
                      ))}
                    </datalist>
                  </div>
                )}
              </form.Field>
            </div>

            <div className="space-y-1">
              <form.Field name="quantity">
                {(field: FieldApi<ScheduleFormValues, 'quantity', any, any>) => (
                  <div>
                    <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                      Qty *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-black text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-center"
                    />
                  </div>
                )}
              </form.Field>
            </div>
          </div>

          {/* Unit and Start Date */}
          <div className="grid grid-cols-2 gap-2.5">
            <form.Field name="quantity_unit">
              {(field: FieldApi<ScheduleFormValues, 'quantity_unit', any, any>) => (
                <div className="space-y-1">
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Ration Unit
                  </label>
                  <select
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                  >
                    <option value="item">Items (Whole)</option>
                    <option value="g">Grams (g)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="oz">Ounces (oz)</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="start_date">
              {(field: FieldApi<ScheduleFormValues, 'start_date', any, any>) => (
                <div className="space-y-1">
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Starting Date *
                  </label>
                  <input
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              )}
            </form.Field>
          </div>

          {/* Interval Frequency Controls */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
            <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <Repeat size={12} /> Frequency Cadence
            </span>
            <div className="grid grid-cols-2 gap-2">
              <form.Field name="interval_value">
                {(field: FieldApi<ScheduleFormValues, 'interval_value', any, any>) => (
                  <input
                    type="number"
                    min="1"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-900 text-center"
                  />
                )}
              </form.Field>
              <form.Field name="interval_unit">
                {(field: FieldApi<ScheduleFormValues, 'interval_unit', any, any>) => (
                  <select
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value as 'days' | 'weeks')}
                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 cursor-pointer"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                )}
              </form.Field>
            </div>
          </div>

          {/* Supplements & Additives */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <form.Field name="calci_dust">
              {(field: FieldApi<ScheduleFormValues, 'calci_dust', any, any>) => (
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] font-bold text-slate-700">CalciDust</span>
                </label>
              )}
            </form.Field>
            <form.Field name="vitamins">
              {(field: FieldApi<ScheduleFormValues, 'vitamins', any, any>) => (
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] font-bold text-slate-700">Multivitamins</span>
                </label>
              )}
            </form.Field>
          </div>

          {/* Husbandry Notes */}
          <form.Field name="notes">
            {(field: FieldApi<ScheduleFormValues, 'notes', any, any>) => (
              <div className="space-y-1">
                <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Preparation Notes
                </label>
                <textarea
                  rows={2}
                  value={field.state.value || ''}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none"
                  placeholder="Thaw at room temperature, dust heads only..."
                />
              </div>
            )}
          </form.Field>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 sm:gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-100 text-slate-700 font-bold text-[10px] sm:text-xs uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <form.Subscribe
              selector={(state) => [state.isSubmitting]}
              children={([isSubmitting]) => (
                <button
                  type="submit"
                  disabled={saveScheduleMutation.isPending || isSubmitting}
                  className="flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {saveScheduleMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {initialData?.id ? 'Update Schedule' : 'Generate Diet Routine'}
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}

export default FeedingScheduleModal;