import Link from 'next/link';
import { ArrowLeftIcon, SearchXIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <SearchXIcon className="size-8" />
      </div>
      <Badge variant="outline" className="mb-3 font-mono">
        HTTP 404
      </Badge>
      <h1 className="text-2xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-sm text-muted-foreground">That page or event doesn&apos;t exist, or isn&apos;t published yet.</p>
      <Button asChild className="mt-6">
        <Link href="/">
          <ArrowLeftIcon /> Go home
        </Link>
      </Button>
    </div>
  );
}
