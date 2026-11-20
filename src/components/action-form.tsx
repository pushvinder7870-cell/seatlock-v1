'use client';

import { createContext, useContext, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NOTICES } from '@/lib/notices';

type ActionResult = Record<string, unknown> & { redirect?: string; notice?: string | null; message?: string };

const PendingContext = createContext(false);

/**
 * A plain HTML <form method="post"> (works without JavaScript) that, when JS
 * is available, submits via fetch instead: success → toast + navigate/refresh,
 * error (403/409/422/503…) → toast with the server's message, no page change.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  onSuccess,
  onError,
  stay = false,
  confirmLabel = 'Yes',
}: {
  action: string;
  children: ReactNode;
  className?: string;
  /** Ask for confirmation (in-app toast with Yes/Keep) before submitting. */
  confirm?: string;
  confirmLabel?: string;
  /** Stay on the current page after success (just refresh data) instead of following the server's redirect. */
  stay?: boolean;
  onSuccess?: (result: ActionResult) => void;
  onError?: (result: ActionResult, status: number) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    if (confirm) {
      // In-app confirmation toast instead of the browser's confirm() dialog.
      toast.warning(confirm, {
        id: `confirm-${action}`,
        duration: 12000,
        action: { label: confirmLabel, onClick: () => void submit(data) },
        cancel: { label: 'Keep', onClick: () => {} },
      });
      return;
    }
    void submit(data);
  }

  async function submit(data: FormData) {
    setPending(true);
    try {
      const res = await fetch(action, {
        method: 'POST',
        headers: { 'x-seatlock-enhanced': '1', accept: 'application/json' },
        body: new URLSearchParams(data as unknown as Record<string, string>),
      });
      const json: ActionResult = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message ?? `Request failed (${res.status})`, {
          description: res.status === 503 ? 'Lots of people are booking right now. Try again in a moment.' : undefined,
        });
        onError?.(json, res.status);
        router.refresh();
        return;
      }
      const msg = json.notice ? NOTICES[json.notice] : null;
      if (msg) toast.success(msg);
      onSuccess?.(json);
      const target = json.redirect;
      if (!stay && target && target.split('?')[0] !== pathname) router.push(target);
      else router.refresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" action={action} className={className} onSubmit={handleSubmit}>
      <PendingContext value={pending}>{children}</PendingContext>
    </form>
  );
}

export function SubmitButton({ children, disabled, ...props }: ComponentProps<typeof Button>) {
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && <Loader2Icon className="animate-spin" />}
      {children}
    </Button>
  );
}

export function useFormPending() {
  return useContext(PendingContext);
}
