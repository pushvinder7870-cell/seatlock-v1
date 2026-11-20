import Link from 'next/link';
import { ArrowLeftIcon, ShieldAlertIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function Forbidden() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-rose-500/20 blur-2xl" />
        <div className="relative grid size-16 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <ShieldAlertIcon className="size-8" />
        </div>
      </div>
      <Badge variant="outline" className="mb-3 font-mono">
        HTTP 403 · FORBIDDEN
      </Badge>
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You don&apos;t have permission to view this. Organizers can only access their own events. This attempt was recorded in the audit log.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">
          <ArrowLeftIcon /> Back to safety
        </Link>
      </Button>
    </div>
  );
}
