import { GraduationCapIcon, MegaphoneIcon, SaveIcon, ShieldIcon, UsersIcon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { listUsers } from '@/lib/services/users';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormMeta, NativeSelect, PageHeader, StatCard } from '@/components/common';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { RoleBadge } from '@/components/site-nav';
import { initials } from '@/lib/format';

export const metadata = { title: 'Users' };

export default async function UsersPage() {
  const user = await requireUser();
  const users = await guard(listUsers(user));
  const count = (r: string) => users.filter((u) => u.role === r).length;

  return (
    <>
      <PageHeader icon={UsersIcon} eyebrow="Admin" title="Users & roles" description="Changing a role or deactivating a user signs them out everywhere immediately." />
      <div className="mb-8 grid grid-cols-3 gap-4">
        <StatCard label="Admins" value={count('admin')} icon={ShieldIcon} tone="danger" />
        <StatCard label="Organizers" value={count('organizer')} icon={MegaphoneIcon} tone="warning" />
        <StatCard label="Students" value={count('student')} icon={GraduationCapIcon} />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">User</TableHead>
              <TableHead className="hidden sm:table-cell">Current role</TableHead>
              <TableHead className="pr-4 text-right">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const self = u.id === user.id;
              return (
                <TableRow key={u.id} className={u.is_active ? '' : 'opacity-55'}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {u.name} {self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      <RoleBadge role={u.role} />
                      {!u.is_active && <span className="text-xs text-muted-foreground">inactive</span>}
                    </div>
                  </TableCell>
                  <TableCell className="pr-4">
                    <ActionForm action={`/api/admin/users/${u.id}`} className="flex items-center justify-end gap-3">
                      <FormMeta user={user} redirect="/admin/users" />
                      <NativeSelect name="role" defaultValue={u.role} className="h-8 w-32" aria-label={`Role for ${u.email}`} disabled={self}>
                        <option value="student">student</option>
                        <option value="organizer">organizer</option>
                        <option value="admin">admin</option>
                      </NativeSelect>
                      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <input type="checkbox" name="isActive" defaultChecked={u.is_active} disabled={self} className="size-4 accent-[var(--primary)]" />
                        Active
                      </label>
                      <SubmitButton size="sm" variant="outline" disabled={self}>
                        <SaveIcon /> Save
                      </SubmitButton>
                    </ActionForm>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
