import { AdminOnly } from "@/components/dashboard/admin-only";
import { PlanningView } from "@/components/dashboard/planning-view";

export default function PlanningPage() {
  return (
    <AdminOnly>
      <PlanningView />
    </AdminOnly>
  );
}
