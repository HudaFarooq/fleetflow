import { AdminOnly } from "@/components/dashboard/admin-only";
import { UserManagement } from "@/components/dashboard/user-management";

export default function UsersPage() {
  return (
    <AdminOnly>
      <UserManagement />
    </AdminOnly>
  );
}
