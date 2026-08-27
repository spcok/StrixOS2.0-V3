import { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { 
  Calendar as CalIcon, 
  Search, 
  Loader2, 
  Clock, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Feather,
  Phone,
  LayoutGrid,
  CalendarDays,
  ListTodo
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { 
  EventsCalendar, 
  EventStaffAllocation, 
  EventAnimalAllocation,
  Animal, 
  User 
} from '../../types';

interface OperationalCalendarEvent extends EventsCalendar {
  staff_allocations?: (EventStaffAllocation & { users?: Partial<User> | null })[];
  animal_allocations?: (EventAnimalAllocation & { animals?: Partial<Animal> | null })[];
}

const getLocalDateString = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('T')[0]!.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const formatDisplayTime = (dateStr: string): string => {
  if (dateStr.length === 5 && dateStr.includes(':')) return dateStr;
  const dateObj = new Date(dateStr);
  if (Number.isNaN(dateObj.getTime())) return dateStr;
  return dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

// ------------------------------------------------------------------
// 1. QUERY OPTIONS
// ------------------------------------------------------------------
const getOperationalEventsOptions = (startDate: string, endDate: string) =>
  queryOptions({
    queryKey: ['operational_calendar', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events_calendar')
        .select(`
          *,
          staff_allocations:event_staff_allocations (
            *,
            users:user_id (id, name, initials, role)
          ),
          animal_allocations:events_animals (
            *,
            animals (id, name, species, ring_number, profile_image_url)
          )
        `)
        .eq('is_deleted', false)
        .gte('start_time', `${startDate}T00:00:00.000Z`)
        .lte('start_time', `${endDate}T23:59:59.999Z`)
        .order('start_time', { ascending: true });

      if (error) throw error;
      return (data || []) as OperationalCalendarEvent[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
  });

export const Route = createFileRoute('/logistics/calendar')({
  loader: async ({ context }) => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    await context.queryClient.ensureQueryData(
      getOperationalEventsOptions(getLocalDateString(start), getLocalDateString(end))
    );
  },
  component: OperationalCalendarPage,
});

export function OperationalCalendarPage() {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const rangeStartStr = useMemo(() => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    return getLocalDateString(start);
  }, [currentDate]);

  const rangeEndStr = useMemo(() => {
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
    return getLocalDateString(end);
  }, [currentDate]);

  const { data: events = [], isLoading } = useQuery(
    getOperationalEventsOptions(rangeStartStr, rangeEndStr)
  );

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const q = searchQuery.toLowerCase();
      return (
        !q ||
        e.title.toLowerCase().includes(q) ||
        (e.venue_address || '').toLowerCase().includes(q) ||
        e.site_contact_name.toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q)
      );
    });
  }, [events, searchQuery]);

  // Date Navigation Steppers
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'DAY') next.setDate(next.getDate() - 1);
    else if (viewMode === 'WEEK') next.setDate(next.getDate() - 7);
    else next.setMonth(next.getMonth() - 1);
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'DAY') next.setDate(next.getDate() + 1);
    else if (viewMode === 'WEEK') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Week Interval Calculations (Monday to Sunday)
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const dayOfWeek = curr.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() - distanceToMonday);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        dateObj: d,
        dateStr: getLocalDateString(d),
        dayName: d.toLocaleDateString('en-GB', { weekday: 'short' }),
        dayNum: d.getDate(),
        isToday: getLocalDateString(d) === getLocalDateString(new Date()),
      };
    });
  }, [currentDate]);

  // Month Interval Calculations
  const monthMatrix = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const firstDayIndex = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
    const totalDays = lastDayOfMonth.getDate();

    const matrix: ({ dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean } | null)[] = [];

    // Prepend blank padding
    for (let i = 0; i < firstDayIndex; i++) {
      matrix.push(null);
    }

    // Fill days
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      matrix.push({
        dateStr: getLocalDateString(d),
        dayNum: day,
        isCurrentMonth: true,
        isToday: getLocalDateString(d) === getLocalDateString(new Date()),
      });
    }

    return matrix;
  }, [currentDate]);

  const getEventTypeTag = (type: string) => {
    switch (type) {
      case 'WEDDING':
        return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-purple-50 text-purple-700 border border-purple-200 text-left">Wedding</span>;
      case 'SCHOOL_TALK':
        return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-200 text-left">School</span>;
      case 'PARTY':
        return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-pink-50 text-pink-700 border border-pink-200 text-left">Party</span>;
      case 'EXPERIENCE':
        return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 text-left">Experience</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 border border-slate-200 text-left">{type.replace(/_/g, ' ')}</span>;
    }
  };

  const getHeaderText = () => {
    if (viewMode === 'DAY') {
      return currentDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    if (viewMode === 'WEEK') {
      const first = weekDays[0]!.dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const last = weekDays[6]!.dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${first} – ${last}`;
    }
    return currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans text-left">
      {/* Header */}
      <div className="flex justify-between items-center w-full shrink-0 text-left">
        <div className="text-left">
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-none flex items-center gap-2 text-left">
            Operational Calendar
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-1 text-left">
            Master Roster, Specimen Deployments &amp; Event Timings
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 shrink-0 text-left">
          <button
            type="button"
            onClick={() => setViewMode('DAY')}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
              viewMode === 'DAY' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => setViewMode('WEEK')}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
              viewMode === 'WEEK' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setViewMode('MONTH')}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
              viewMode === 'MONTH' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0 text-left">
        <div className="relative flex-1 shrink-0 text-left">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search bookings, venues, or staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-xs placeholder:text-slate-400 font-medium text-left"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-xs shrink-0 text-left">
          <button
            type="button"
            onClick={handlePrev}
            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            <ChevronLeft size={15} />
          </button>

          <span className="text-xs font-black uppercase tracking-wider text-slate-800 px-2 text-left min-w-[160px] text-center">
            {getHeaderText()}
          </span>

          <button
            type="button"
            onClick={handleNext}
            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            <ChevronRight size={15} />
          </button>

          <button
            type="button"
            onClick={handleToday}
            className="ml-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Main Schedule Canvas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden relative text-left">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100 text-left">
              <Loader2 className="animate-spin text-slate-800" size={20} />
              <span className="text-xs font-bold text-slate-700 text-left">Loading operational schedule...</span>
            </div>
          </div>
        )}

        {/* 1. DAY VIEW */}
        {viewMode === 'DAY' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-slate-50/30 text-left">
            {(() => {
              const selectedDateStr = getLocalDateString(currentDate);
              const dayEvents = filteredEvents.filter(e => e.start_time.startsWith(selectedDateStr));

              if (dayEvents.length === 0) {
                return (
                  <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center">
                    <CalIcon size={40} className="opacity-20 mb-2" />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-700">No Events Scheduled</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      No bookings registered for {formatDisplayDate(selectedDateStr)}.
                    </p>
                  </div>
                );
              }

              return dayEvents.map((event) => (
                <div
                  key={event.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-slate-300 transition-all space-y-3 text-left"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 text-left">
                    <div className="flex items-center gap-2">
                      {getEventTypeTag(event.event_type)}
                      <h3 className="font-black text-slate-900 text-base tracking-tight text-left">
                        {event.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                      <Clock size={13} className="text-slate-400" />
                      <span>{formatDisplayTime(event.start_time)} &ndash; {formatDisplayTime(event.end_time)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-left bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Venue &amp; Location</span>
                      <p className="font-bold text-slate-800 flex items-start gap-1 mt-0.5">
                        <MapPin size={12} className="text-slate-400 shrink-0 mt-0.5" />
                        <span>{event.venue_address}</span>
                      </p>
                    </div>

                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Day-of Contact</span>
                      <p className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                        <Phone size={12} className="text-slate-400 shrink-0" />
                        <span>{event.site_contact_name} {event.site_contact_phone ? `(${event.site_contact_phone})` : ''}</span>
                      </p>
                    </div>

                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Rehearsals &amp; Brief</span>
                      {event.rehearsal_at_centre_date && (
                        <p className="text-[10px] font-bold text-emerald-700">
                          Centre: {formatDisplayDate(event.rehearsal_at_centre_date)} at {formatDisplayTime(event.rehearsal_at_centre_time)}
                        </p>
                      )}
                      {event.rehearsal_time && (
                        <p className="text-[10px] font-bold text-purple-700">
                          Onsite Rehearsal: {formatDisplayTime(event.rehearsal_time)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Staff & Bird Deployments */}
                  <div className="flex flex-wrap items-center gap-4 pt-1 text-left">
                    {event.staff_allocations && event.staff_allocations.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Users size={14} className="text-slate-400" />
                        <span>Assigned Staff:</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {event.staff_allocations.map(s => (
                            <span key={s.id} className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-black text-slate-800">
                              {s.users?.name || 'Staff'} ({s.users?.role || 'Keeper'})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {event.animal_allocations && event.animal_allocations.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Feather size={14} className="text-emerald-600" />
                        <span>Assigned Specimens:</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {event.animal_allocations.map(a => (
                            <span key={a.id} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-black">
                              {a.animals?.name || 'Bird'} {a.role_description ? `(${a.role_description})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {/* 2. WEEK VIEW */}
        {viewMode === 'WEEK' && (
          <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar p-3 bg-slate-50/40 text-left">
            <div className="grid grid-cols-7 gap-2 min-w-[980px] h-full text-left">
              {weekDays.map((day) => {
                const dayEvents = filteredEvents.filter(e => e.start_time.startsWith(day.dateStr));

                return (
                  <div
                    key={day.dateStr}
                    className={`flex flex-col rounded-2xl border ${
                      day.isToday
                        ? 'bg-white border-emerald-400/80 shadow-xs'
                        : 'bg-white/80 border-slate-200'
                    } overflow-hidden min-h-[360px] text-left`}
                  >
                    {/* Day Column Header */}
                    <div className={`p-2.5 border-b text-center shrink-0 ${
                      day.isToday ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-800 border-slate-100'
                    }`}>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${day.isToday ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {day.dayName}
                      </p>
                      <p className="text-base font-black leading-none mt-0.5">{day.dayNum}</p>
                    </div>

                    {/* Day Event List */}
                    <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar text-left">
                      {dayEvents.length === 0 ? (
                        <p className="text-[10px] text-slate-300 font-bold uppercase text-center pt-8 tracking-widest">
                          No Events
                        </p>
                      ) : (
                        dayEvents.map((event) => (
                          <div
                            key={event.id}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1 hover:border-slate-300 transition-all text-left shadow-2xs"
                          >
                            <div className="flex items-center justify-between text-[9px] font-bold text-slate-500">
                              <span>{formatDisplayTime(event.start_time)}</span>
                              {getEventTypeTag(event.event_type)}
                            </div>

                            <p className="text-xs font-black text-slate-900 leading-snug line-clamp-2 text-left">
                              {event.title}
                            </p>

                            <p className="text-[10px] text-slate-500 truncate text-left">
                              {event.venue_address}
                            </p>

                            {/* Specimen Badges */}
                            {event.animal_allocations && event.animal_allocations.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 pt-1 text-left">
                                {event.animal_allocations.map(a => (
                                  <span key={a.id} className="text-[8px] font-black bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded">
                                    {a.animals?.name || 'Bird'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. MONTH VIEW */}
        {viewMode === 'MONTH' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-slate-50/40 text-left">
            <div className="grid grid-cols-7 gap-1.5 min-w-[760px] text-left">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center py-1">
                  {day}
                </div>
              ))}

              {monthMatrix.map((cell, idx) => {
                if (!cell) {
                  return <div key={`blank-${idx}`} className="bg-slate-50/40 border border-slate-100 rounded-xl min-h-[90px]" />;
                }

                const dayEvents = filteredEvents.filter(e => e.start_time.startsWith(cell.dateStr));

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => {
                      const [y, m, d] = cell.dateStr.split('-').map(Number);
                      setCurrentDate(new Date(y!, m! - 1, d!));
                      setViewMode('DAY');
                    }}
                    className={`bg-white border ${
                      cell.isToday ? 'border-emerald-500 shadow-xs' : 'border-slate-200'
                    } rounded-xl p-1.5 min-h-[96px] flex flex-col justify-between hover:border-slate-400 transition-all cursor-pointer text-left`}
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 text-left">
                      <span className={`text-xs font-black ${cell.isToday ? 'text-emerald-600 font-black' : 'text-slate-700'}`}>
                        {cell.dayNum}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[8px] font-black bg-slate-100 text-slate-600 px-1 py-0.2 rounded">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 overflow-y-auto custom-scrollbar max-h-16 pt-1 text-left">
                      {dayEvents.map(e => (
                        <div
                          key={e.id}
                          className="px-1.5 py-0.5 rounded text-[8px] font-black truncate bg-slate-50 border border-slate-200 text-slate-800 text-left"
                          title={`${formatDisplayTime(e.start_time)} - ${e.title}`}
                        >
                          <span className="text-slate-400">{formatDisplayTime(e.start_time)}</span> {e.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OperationalCalendarPage;