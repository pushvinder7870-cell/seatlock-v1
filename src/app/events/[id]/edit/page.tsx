import Link from 'next/link';
import { ArrowLeftIcon, PencilIcon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { getEventForEdit } from '@/lib/services/events';
import { Button } from '@/components/ui/button';
import { EventForm } from '@/components/event-form';
import { PageHeader } from '@/components/common';

export const metadata = { title: 'Edit event' };

export default async function EditEventPage({ params }: PageProps<'/events/[id]/edit'>) {
  const user = await requireUser();
  const { id } = await params;
  const event = await guard(getEventForEdit(user, id));
  return (
    <>
      <PageHeader
        icon={PencilIcon}
        eyebrow="Edit event"
        title={event.name}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/events/${id}`}>
              <ArrowLeftIcon /> Back to seat map
            </Link>
          </Button>
        }
      />
      <EventForm user={user} event={event} />
    </>
  );
}
