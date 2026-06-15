import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, NotificationDto, NotificationListDto } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
};

export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<NotificationListDto>>('/notifications');
      return res.data.data;
    },
    // Poll so the bell badge stays fresh without a manual refresh.
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch<ApiResponse<NotificationDto>>(
        `/notifications/${id}/read`,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
  });
}
