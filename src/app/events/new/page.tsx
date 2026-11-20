import { CalendarPlusIcon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { requireRole } from '@/lib/services/authz';
import { EventForm } from '@/components/event-form';
import { PageHeader } from '@/components/common';

export const metadata = { title: 'New event' };

export default async function NewEventPage() {
  const user = await requireUser();
  // The proxy already blocks non-organizers; this is the defence-in-depth check
  // (audited 403). createEvent() re-checks on submit.
  await guard(requireRole(user, ['organizer'], { action: 'newEventPage' }));
  return (
    <>
      <PageHeader icon={CalendarPlusIcon} eyebrow="Organizer" title="New event" description="Set the details and seat layout. You can publish now or keep it as a draft." />
      <EventForm user={user} />
    </>
  );
}
