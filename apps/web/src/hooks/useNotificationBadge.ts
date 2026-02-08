import { useWorkspace } from "../providers/workspace";
import { api } from "../utils/api";

export const useNotificationBadge = () => {
  const { workspace, hasLoaded } = useWorkspace();

  const query = api.notification.unreadCount.useQuery(
    workspace.publicId ? { workspacePublicId: workspace.publicId } : {},
    {
      enabled: hasLoaded,
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
    },
  );

  return {
    unreadCount: query.data?.unreadCount ?? 0,
    hasUnseen: query.data?.hasUnseen ?? false,
    isLoading: query.isPending,
    refetch: query.refetch,
  };
};
