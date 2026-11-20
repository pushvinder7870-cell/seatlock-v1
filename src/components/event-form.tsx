import { InfoIcon, SaveIcon, SparklesIcon } from 'lucide-react';
import type { CurrentUser } from '@/lib/session';
import type { EventRow } from '@/lib/services/events';
import { APP_TIME_ZONE, toLocalInput } from '@/lib/time';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionForm, SubmitButton } from './action-form';
import { FormMeta, NativeSelect } from './common';
import { ImageField } from './image-field';
import { DescriptionField } from './description-field';
import { aiEnabled } from '@/lib/ai/claude';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Shared by "new event" and "edit event". Plain HTML form, enhanced with toasts when JS is on. */
export function EventForm({ user, event }: { user: CurrentUser; event?: EventRow }) {
  return (
    <ActionForm action={event ? `/api/events/${event.id}` : '/api/events'} className="max-w-3xl">
      <FormMeta user={user} redirect={event ? `/events/${event.id}/edit` : '/events/new'} />
      {/* Optimistic locking: the version this form was rendered from. */}
      {event && <input type="hidden" name="version" value={event.version} />}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            {event ? 'Event details' : 'Create an event'}
            {event && (
              <Badge variant="secondary" className="font-mono">
                v{event.version}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {event ? 'Changes are visible to students immediately once published.' : 'A numbered seat grid is generated automatically.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 py-2">
          {event && (
            <Alert>
              <InfoIcon />
              <AlertTitle>Protected against lost updates</AlertTitle>
              <AlertDescription>
                If someone else saves this event while you&apos;re editing, your save is rejected (409) instead of silently overwriting their changes.
              </AlertDescription>
            </Alert>
          )}
          <Field id="cover" label="Cover photo" hint="Shown on the event card and as the banner on the seat-map page.">
            <ImageField csrfToken={user.csrfToken} initialUrl={event?.image_url} />
          </Field>
          <Field id="name" label="Event name">
            <Input id="name" name="name" required maxLength={255} defaultValue={event?.name} placeholder="Fest Headline Night" />
          </Field>
          <Field id="description" label="Description">
            <DescriptionField defaultValue={event?.description ?? ''} csrfToken={user.csrfToken} aiEnabled={aiEnabled()} />
          </Field>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="venue" label="Venue">
              <Input id="venue" name="venue" defaultValue={event?.venue ?? ''} placeholder="Main Auditorium" />
            </Field>
            <Field id="eventDate" label="Starts at" hint={`Time zone: ${APP_TIME_ZONE}. Booking closes at this time.`}>
              <Input id="eventDate" name="eventDate" type="datetime-local" required defaultValue={event ? toLocalInput(event.event_date) : undefined} />
            </Field>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="status" label="Status">
              <NativeSelect id="status" name="status" defaultValue={event?.status ?? 'draft'}>
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published</option>
                <option value="cancelled">Cancelled</option>
              </NativeSelect>
            </Field>
            <Field id="priceRupees" label="Ticket price (₹)" hint="0 = free. Students pay at a demo checkout.">
              <Input
                id="priceRupees"
                name="priceRupees"
                type="number"
                min={0}
                max={100000}
                step="1"
                defaultValue={event ? event.price_cents / 100 : 0}
                required
              />
            </Field>
            {!event && (
              <>
                <Field id="rows" label="Rows" hint="A–Z, max 26">
                  <Input id="rows" name="rows" type="number" min={1} max={26} defaultValue={8} required />
                </Field>
                <Field id="seatsPerRow" label="Seats per row" hint="Max 40">
                  <Input id="seatsPerRow" name="seatsPerRow" type="number" min={1} max={40} defaultValue={10} required />
                </Field>
              </>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <SubmitButton size="lg" className="h-9 px-4">
            {event ? <SaveIcon /> : <SparklesIcon />}
            {event ? 'Save changes' : 'Create event'}
          </SubmitButton>
        </CardFooter>
      </Card>
    </ActionForm>
  );
}
