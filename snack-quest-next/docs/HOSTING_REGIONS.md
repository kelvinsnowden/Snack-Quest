# Why the functions run in Cape Town

`vercel.json` pins `regions: ["cpt1"]`. That one line is the largest
performance decision in this deployment, so it is worth writing down why
— and what to check before changing it.

## The problem it solves

Firestore for this project lives in **`africa-south1` (Johannesburg)**.
Confirmed directly:

```
GET https://firestore.googleapis.com/v1/projects/snack-quest-os/databases/(default)
→ locationId: africa-south1
```

Vercel's default function region is **`iad1` (Washington DC)**. Every
deployment before this one recorded `"regions": ["iad1"]`.

That put roughly **13,000 km between the code and its database**. Every
Firestore read — a session check, a list of orders, a package lookup —
was a transatlantic round trip of roughly 230–280 ms. Admin pages make
several of those, some of them necessarily in sequence, so a page that
does four dependent reads spent about a second doing nothing but
waiting. No amount of query tuning fixes that, because the time is not
being spent in the query.

Cape Town is ~1,270 km from Johannesburg, which is on the order of
20 ms round trip — roughly a **tenfold reduction on every single
Firestore call in the application**.

It is also closer to the people using it. Nairobi → Cape Town is
~4,100 km against ~12,000 km to Washington, so first-byte time improves
for staff and customers as well as for the database.

## Firestore's location cannot move

A Firestore database's location is fixed when it is created and cannot
be changed afterwards. Moving the data would mean creating a second
database and migrating every collection into it. Moving the compute is a
one-line change. That asymmetry is the whole argument.

## Before changing this

Any future change to `regions` should be checked against the same two
questions, in this order:

1. **Where is Firestore?** Re-run the API call above. If the database
   ever moves, the functions should follow it, not the other way round.
2. **Where are the users?** Secondary, but real. Kenya is the market.

A region that is fast for users but far from Firestore will be slower
overall than the reverse, because a page load makes many database round
trips and only one round trip to the browser.

## Verifying it actually applied

An invalid region identifier is not silently ignored, but neither is it
obvious from the outside. Confirm it took by reading the deployment
back:

```
GET /v13/deployments/<id>  →  "regions": ["cpt1"]
```

This was verified on a preview deployment before being merged, precisely
so that a wrong value would cost a preview build rather than production.
