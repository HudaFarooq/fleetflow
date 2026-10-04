import { AdminOnly } from "@/components/dashboard/admin-only";
import { AnalyticsView } from "@/components/dashboard/analytics-view";

export default function AnalyticsPage() {
  return (
    <AdminOnly>
      <AnalyticsView />
    </AdminOnly>
  );
}
