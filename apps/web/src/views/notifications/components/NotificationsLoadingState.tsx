import LoadingSpinner from "~/components/LoadingSpinner";

export function NotificationsLoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
