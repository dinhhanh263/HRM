import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ApiResponse, CalendarMonthData } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const calendarKeys = {
  month: (month: string) => ['calendar-events', month] as const,
};

// SPEC-035: month view of the event calendar. Keeps the previous month's data
// on screen while the next one loads so navigation doesn't flash a skeleton.
export function useCalendarEvents(month: string) {
  return useQuery({
    queryKey: calendarKeys.month(month),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CalendarMonthData>>(
        `/dashboard/events?month=${month}`
      );
      return res.data.data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
