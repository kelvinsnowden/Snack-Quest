import type { Metadata } from 'next';
import { orderMeetingService } from '@/services/orderMeetingService';
import { MeetingBooking } from '@/components/marketing/leads/MeetingBooking';

/**
 * `/meet` — where a prospective owner books the meeting to talk it
 * through and place a machine order (§ order meetings). The link goes
 * out in one email to every vending lead, so unlike `/call/{token}`
 * there is no per-person token: the form asks who they are.
 * `noindex`: it's for the people we sent it to, not for search.
 */
export const metadata: Metadata = {
  title: 'Book your order meeting',
  robots: { index: false, follow: false },
};

export default async function MeetPage() {
  const days = await orderMeetingService.bookingDays();

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
      <MeetingBooking days={days} />
    </div>
  );
}
