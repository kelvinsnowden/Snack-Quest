import { MapPin, Phone } from 'lucide-react';
import type { DeliveryDetails } from '@/types';

/**
 * Where the box is going and how to get it there, on a phone
 * (§ Warehouse workspace).
 *
 * Every part of the address, not just `addressText`. A Nairobi address
 * is found by its estate and the thing it is opposite, so an order
 * showing only the street line is one the rider has to phone about —
 * `estate` and `landmark` are collected at checkout precisely because
 * they are how a place is actually located, and dropping them here
 * wasted the collecting.
 *
 * The two useful things a phone can do are wired up: the number dials
 * and the address opens in maps. Somebody standing on a street holding
 * a box should not be retyping either.
 *
 * `contactPhone` is shown only when it differs from the number that
 * placed the order — it is set when somebody else is receiving, and
 * repeating the same digits under a second heading would just be
 * noise.
 */
export function DeliveryTarget({
  delivery,
  orderPhone,
}: {
  delivery: DeliveryDetails;
  /** The number that placed the order, so a duplicate contact isn't repeated. */
  orderPhone: string;
}) {
  const isPickup = delivery.method === 'pickup';
  // Everything that helps find the door, in the order somebody would
  // read it out loud.
  const addressParts = [delivery.addressText, delivery.estate, delivery.landmark].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  const mapsQuery = [...addressParts, delivery.county].filter(Boolean).join(', ');
  const contactPhone =
    delivery.contactPhone && delivery.contactPhone !== orderPhone ? delivery.contactPhone : null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-foreground text-sm font-semibold">
        {isPickup ? 'Pickup' : 'Door delivery'}
        {isPickup && delivery.pickupStationName ? ` — ${delivery.pickupStationName}` : null}
      </span>

      {isPickup ? (
        <span className="text-muted-foreground text-sm">{delivery.county}</span>
      ) : addressParts.length > 0 ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
          target="_blank"
          rel="noreferrer"
          className="text-foreground hover:text-primary flex items-start gap-2 text-sm underline-offset-4 hover:underline"
        >
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            {addressParts.map((part, index) => (
              <span key={part} className={index === 0 ? 'block font-medium' : 'block'}>
                {part}
              </span>
            ))}
            <span className="text-muted-foreground block">{delivery.county}</span>
          </span>
        </a>
      ) : (
        /*
         * A door order with nothing to deliver to. Said plainly here
         * rather than rendered as an empty gap, because the fix is a
         * phone call and the rider needs to know that before setting
         * off.
         */
        <span className="text-warning text-sm font-medium">
          No address on this order — call the customer before setting off.
        </span>
      )}

      {contactPhone ? (
        <a
          href={`tel:${contactPhone}`}
          className="text-foreground hover:text-primary flex items-center gap-2 text-sm tabular-nums underline-offset-4 hover:underline"
        >
          <Phone className="size-4 shrink-0" aria-hidden="true" />
          {contactPhone}
          <span className="text-muted-foreground">· receiving</span>
        </a>
      ) : null}

      {/*
        The courier's own reference. What a customer quotes when they
        ring about a box that has not turned up, so the person they
        reach has to be able to see it.
      */}
      {delivery.courierShipmentRef ? (
        <span className="text-muted-foreground text-caption tabular-nums">
          Waybill {delivery.courierShipmentRef}
        </span>
      ) : null}
    </div>
  );
}
