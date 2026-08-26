import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/orders/format';
import type { AnalyticsEvent, ConversionAttribution } from '@/types';

/**
 * Where this sale came from, and what the customer did to get here
 * (§ close the loop: ad-conversion attribution).
 *
 * The aggregate funnel answers "how many people reached checkout".
 * This answers the different question, and on a shop with a handful of
 * sales the far more useful one: which ad earned *this* order, and
 * what did the person who actually bought do on the way to it.
 *
 * The channel is derived the same way `businessAnalyticsService`
 * derives it for the revenue-by-channel report, so a single order and
 * the chart it appears in can never disagree.
 */

/** Human names for the events the funnel records, in the order a visit produces them. */
const EVENT_LABELS: Record<string, string> = {
  box_selected: 'Chose a box',
  checkout_form_started: 'Started filling in checkout',
  delivery_quote_served: 'Saw a delivery price',
  pay_submitted: 'Pressed pay',
  quote_error: 'Hit an error getting a price',
  whatsapp_order_started: 'Opened WhatsApp to order',
  rescue_offer_shown: 'Shown the exit offer',
  rescue_offer_purchase_completed: 'Bought from the exit offer',
};

function channelOf(
  attribution: ConversionAttribution | null,
  referralLinkId: string | null,
): { label: string; detail: string | null } {
  if (referralLinkId) {
    return { label: 'Creator referral', detail: null };
  }
  if (attribution?.ttclid) {
    return { label: 'TikTok ad', detail: `Click id ${attribution.ttclid}` };
  }
  if (attribution?.fbclid) {
    return { label: 'Meta ad (Facebook or Instagram)', detail: `Click id ${attribution.fbclid}` };
  }
  if (attribution?.channel === 'web') {
    /*
     * No click id means no ad click was tagged on the way in. That is
     * a real finding rather than missing data — it is how a visitor
     * who typed the address, followed a bio link, or came from an
     * untagged post arrives — so it is said plainly instead of shown
     * as "unknown".
     */
    return { label: 'Website, no ad click tagged', detail: null };
  }
  return { label: 'Unknown', detail: null };
}

export function OrderAttributionCard({
  attribution,
  referralLinkId,
  journey,
}: {
  attribution: ConversionAttribution | null;
  referralLinkId: string | null;
  /** What this browser did on the site, oldest first. Empty when the order predates visitor capture. */
  journey: AnalyticsEvent[];
}) {
  const channel = channelOf(attribution, referralLinkId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where this sale came from</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-foreground font-medium">{channel.label}</span>
          {channel.detail ? (
            <span className="text-muted-foreground text-caption break-all">{channel.detail}</span>
          ) : null}
          {attribution?.landingUrl ? (
            <span className="text-muted-foreground text-caption break-all">
              Landed from {attribution.landingUrl}
            </span>
          ) : null}
        </div>

        <div className="border-border border-t pt-3">
          <p className="text-foreground mb-2 text-sm font-medium">What they did on the site</p>
          {journey.length === 0 ? (
            /*
             * Two different reasons for an empty journey, and the
             * difference matters: an order placed before the visitor
             * id was captured can never have one, while a recent order
             * with none means the browser refused the cookie.
             */
            <p className="text-muted-foreground text-sm">
              {attribution?.visitorId
                ? 'Nothing recorded for this visitor.'
                : 'Not recorded — this order predates visitor tracking.'}
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {journey.map((event, index) => (
                <li key={`${event.event}-${index}`} className="flex items-baseline gap-3 text-sm">
                  <span className="text-muted-foreground w-6 shrink-0 tabular-nums">
                    {index + 1}.
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block">
                      {EVENT_LABELS[event.event] ?? event.event}
                    </span>
                    {event.metadata ? (
                      <span className="text-muted-foreground block text-caption break-words">
                        {Object.entries(event.metadata)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-caption tabular-nums">
                    {formatDateTime(event.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
