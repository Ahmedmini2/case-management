import { UserRole } from "@/types/enums";
import { getPermissionMatrix } from "@/lib/permissions";

export default function PermissionsPage() {
  const matrix = getPermissionMatrix();
  const rows = Object.values(UserRole);
  const allPermissions = Array.from(new Set(Object.values(matrix).flat()));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Permissions Matrix</h2>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="whitespace-nowrap p-2">Role</th>
              {allPermissions.map((perm) => (
                <th key={perm} className="whitespace-nowrap p-2">
                  {perm}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((role) => (
              <tr key={role} className="border-b">
                <td className="p-2 font-medium">{role}</td>
                {allPermissions.map((perm) => (
                  <td key={`${role}-${perm}`} className="p-2">
                    {matrix[role].includes(perm) ? "YES" : "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
