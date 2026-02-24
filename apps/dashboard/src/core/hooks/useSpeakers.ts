import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet, apiPost, apiDelete } from '../api-client';
import {
  SpeakersResponseSchema,
  EnrollResponseSchema,
  type EnrollRequest,
  type Speaker,
} from '../schemas';

export const SPEAKERS_QUERY_KEY = ['speakers'] as const;

export function useSpeakers() {
  return useQuery({
    queryKey: SPEAKERS_QUERY_KEY,
    queryFn: () => apiGet('/sv/speakers', SpeakersResponseSchema),
  });
}

export function useEnrollSpeaker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EnrollRequest) => apiPost('/sv/enroll', EnrollResponseSchema, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SPEAKERS_QUERY_KEY });
    },
  });
}

export function useDeleteSpeaker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (speakerId: string) =>
      apiDelete(
        `/sv/speakers/${encodeURIComponent(speakerId)}`,
        z.object({ success: z.boolean().optional() })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SPEAKERS_QUERY_KEY });
    },
    onMutate: async (speakerId) => {
      await queryClient.cancelQueries({ queryKey: SPEAKERS_QUERY_KEY });
      const previous = queryClient.getQueryData<Speaker[]>(SPEAKERS_QUERY_KEY);

      queryClient.setQueryData<Speaker[]>(SPEAKERS_QUERY_KEY, (old) =>
        old?.filter((s) => s.id !== speakerId)
      );

      return { previous };
    },
    onError: (_err, _speakerId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SPEAKERS_QUERY_KEY, context.previous);
      }
    },
  });
}
