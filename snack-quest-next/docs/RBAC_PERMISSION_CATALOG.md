# RBAC permission catalogue

The complete staff permission model, generated from `lib/auth/permissions.ts` and the route guards. Companion to `docs/FINAL_OS_FUNCTIONALITY_AUDIT.md` §9.

## The model

- **A permission is `resource.action`.** Every staff API route method checks exactly one (`hasPermission`, `forbiddenForPermission` → 403 `{permission}`), and each page's layout checks the one the page is about (`requireAdminPage`, or `requireWorkspacePage` in the Finance and Warehouse workspaces).
- **Effective access** = the person's template (or their role's default template) ∪ individual grants − individual removals. **A removal beats a grant.**
- **A super admin** holds every permission, can't be narrowed, and is the only one who can give, take or touch the super admin role (§ escalation rules).
- **Roles** only choose the workspace a person lands in: `/admin`, `/warehouse`, `/finance` or `/agent`. What they can do there is their permissions.
- **Legacy section limits** (the older way of narrowing an admin to some Admin sections) still apply to accounts nobody has moved to a template.

## Escalation rules (enforced in `staffManagementService`)

- Nobody changes their own access, role, or account state.
- **Only a super admin** can invite a super admin, promote to or demote from super admin, or disable, remove or reset the password of a super admin.
- **Anyone else holding `users.manage`** can only produce access that is a subset of their own. This applies to invites (template and role), role changes, template and individual changes, and clearing legacy section limits. They can only generate a reset link for someone whose access is a subset of their own, because a reset link is a way into that account.
- The last super admin can't be demoted, disabled or removed.
- Every change is in the audit log with before and after.

## View-as

A super admin can view the product as the Admin, Support, Warehouse or Finance role. The narrowing is real (routes refuse too); identity and audit stay the super admin's. Viewing as a template or a named person is not built (FA-17).

## Templates

| Template | Permissions | Description |
|---|---:|---|
| Super admin (`super_admin`) | 94 | Everything, including staff access and credentials. |
| Admin (`admin`) | 82 | Runs the whole business day to day. Not staff access, credentials or bulk marketing sends. |
| Machine operations (`machine_operations`) | 32 | Runs the machine fleet: setup, catalogue, prices, stock, alerts. Not money or credentials. |
| Warehouse (`warehouse`) | 28 | Packing, shopping runs and machine restocking. |
| Finance (`finance`) | 14 | Machine sales, refunds and owner money. Read-only on machines. |
| Support (`agent`) | 3 | Customer conversations, courier bookings, and looking up machine sales. |
| Marketing (`marketing`) | 10 | Campaigns, creators, content and the machine screen. No prices, machines or money. |
| Product manager (`product_manager`) | 7 | Boxes, snacks and recipes. No machines, prices or money. |

**Super-admin-only by default** (anyone else needs an individual grant): `orders.contents.edit`, `payments.record_manual`, `payments.reconcile`, `marketing.discounts.manage`, `marketing.messages.manage`, `marketing.messages.send`, `marketing.optouts.remove`, `settings.integrations.manage`, `settings.notifications.manage`, `users.manage`, `users.view_as`, `integrations.credentials.manage`.

## Permissions

Template columns: **SA** = Super admin, **Adm** = Admin, **Ops** = Machine operations, **Wh** = Warehouse, **Fin** = Finance, **Sup** = Support, **Mkt** = Marketing, **PM** = Product manager. ✓ = in the template.

### Orders & delivery

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `orders.view` | See orders | ✓ | ✓ |  |  |  |  |  | ✓ | page gate: `/admin/deliveries`, `/admin/orders` |
| `orders.create` | Create orders for customers | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `POST /api/admin/orders/initiate` |
| `orders.status.update` | Move orders through fulfilment | ✓ | ✓ |  | ✓ |  |  |  |  | 1 route method(s), e.g. `POST /api/admin/orders/[orderId]/status` |
| `orders.collect_payment` | Record payment collected on delivery | ✓ | ✓ |  | ✓ |  |  |  |  | 1 route method(s), e.g. `POST /api/admin/orders/[orderId]/collect-payment` |
| `orders.notify` | Resend order confirmations | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `POST /api/admin/orders/[orderId]/send-confirmation-sms` |
| `orders.contents.edit` ⚠︎SA | Change what is in an order’s box | ✓ |  |  |  |  |  |  |  | 1 route method(s), e.g. `PATCH /api/admin/orders/[orderId]/box` |
| `orders.costs.record` | Record an order’s fulfilment costs | ✓ | ✓ |  | ✓ |  |  |  |  | 1 route method(s), e.g. `POST /api/warehouse/orders/[orderId]/costs` |
| `orders.costs.bulk` | Import fulfilment costs in bulk | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `POST /api/admin/orders/costs/bulk`; page gate: `/admin/fulfilment-costs` |
| `orders.refund` | Refund box orders | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `POST /api/admin/orders/[orderId]/refund` |
| `logistics.view` | See delivery zones | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `GET /api/admin/delivery-zones`; page gate: `/admin/delivery-zones` |
| `logistics.manage` | Manage delivery zones, batches and shipments | ✓ | ✓ |  |  |  |  |  |  | 3 route method(s), e.g. `PATCH /api/admin/delivery-zones`; page gate: `/admin/fulfillment-batches` |
| `logistics.courier.book` | Book couriers | ✓ | ✓ |  | ✓ |  | ✓ |  |  | 1 route method(s), e.g. `POST /api/admin/shipments/[shipmentId]/complete-booking` |
| `warehouse_fulfilment.manage` | Pack orders and run shopping trips | ✓ | ✓ |  | ✓ |  |  |  |  | 4 route method(s), e.g. `POST /api/warehouse/orders/[orderId]/curated-snacks` |

### Catalogue & stock

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `products.view` | See products and snacks | ✓ | ✓ | ✓ | ✓ |  |  | ✓ | ✓ | 2 route method(s), e.g. `GET /api/admin/premium-snacks`; page gate: `/admin/inventory`, `/admin/products`, `/admin/recipes` … |
| `products.manage` | Create and edit boxes | ✓ | ✓ |  |  |  |  |  | ✓ | 2 route method(s), e.g. `PATCH /api/admin/products/[packageId]` |
| `products.recipes.manage` | Edit box recipes | ✓ | ✓ |  |  |  |  |  | ✓ | 2 route method(s), e.g. `PUT /api/admin/recipes/[packageId]` |
| `products.snacks.manage` | Create and edit snacks | ✓ | ✓ |  |  |  |  |  | ✓ | 3 route method(s), e.g. `PATCH /api/admin/snack-items/[id]` |
| `warehouse_inventory.adjust` | Adjust and write off warehouse stock | ✓ | ✓ |  |  |  |  |  |  | 2 route method(s), e.g. `POST /api/admin/inventory/[packageId]/adjust` |
| `procurement.manage` | Manage suppliers and purchase orders | ✓ | ✓ |  |  |  |  |  |  | 6 route method(s), e.g. `POST /api/admin/purchase-orders/[purchaseOrderId]/cancel`; page gate: `/admin/purchase-orders`, `/admin/suppliers` |

### Money

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `finance.view` | See revenue, withdrawals and reconciliation | ✓ | ✓ |  |  | ✓ |  |  |  | page gate: `/admin/analytics`, `/admin/reconciliation`, `/admin/withdrawals` |
| `finance.withdrawals.approve` | Approve and pay creator withdrawals | ✓ | ✓ |  |  |  |  |  |  | 4 route method(s), e.g. `POST /api/admin/withdrawals/[withdrawalId]/approve` |
| `finance.reconciliation.resolve` | Resolve payment reconciliation issues | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `POST /api/admin/reconciliation/resolve` |
| `payments.record_manual` ⚠︎SA | Record an order as already paid | ✓ |  |  |  |  |  |  |  | 2 route method(s), e.g. `PATCH /api/admin/orders/[orderId]/manual-payment` |
| `payments.reconcile` ⚠︎SA | Complete or reconcile stuck payments | ✓ |  |  |  |  |  |  |  | 2 route method(s), e.g. `POST /api/admin/payments/[intentId]/complete` |

### Customers & marketing

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `customers.view` | See customers and wallets | ✓ | ✓ |  |  |  |  | ✓ |  | 1 route method(s), e.g. `GET /api/admin/customers/[phoneNumber]/wallet`; page gate: `/admin/customers` |
| `customers.wallet.adjust` | Adjust customer wallets | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `POST /api/admin/customers/[phoneNumber]/wallet` |
| `creators.manage` | Approve, pause and remove creators | ✓ | ✓ |  |  |  |  | ✓ |  | 1 route method(s), e.g. `POST /api/admin/creators/[uid]/status`; page gate: `/admin/creators` |
| `marketing.campaigns.manage` | Manage campaigns and referral links | ✓ | ✓ |  |  |  |  | ✓ |  | 3 route method(s), e.g. `PATCH /api/admin/campaigns/[campaignId]`; page gate: `/admin/campaigns`, `/admin/referrals` |
| `marketing.discounts.manage` ⚠︎SA | Manage discount codes | ✓ |  |  |  |  |  |  |  | 3 route method(s), e.g. `GET /api/admin/discount-codes`; page gate: `/admin/discount-codes` |
| `marketing.messages.manage` ⚠︎SA | Write marketing emails and SMS | ✓ |  |  |  |  |  |  |  | 13 route method(s), e.g. `GET /api/admin/marketing-emails/[id]`; page gate: `/admin/marketing-emails`, `/admin/marketing-sms` |
| `marketing.messages.send` ⚠︎SA | Send marketing emails and SMS | ✓ |  |  |  |  |  |  |  | 4 route method(s), e.g. `POST /api/admin/marketing-emails/[id]/resend` |
| `marketing.optouts.manage` | See and add SMS opt-outs | ✓ | ✓ |  |  |  |  | ✓ |  | 2 route method(s), e.g. `GET /api/admin/sms-opt-outs`; page gate: `/admin/sms-opt-outs` |
| `marketing.optouts.remove` ⚠︎SA | Remove an SMS opt-out | ✓ |  |  |  |  |  |  |  | 1 route method(s), e.g. `DELETE /api/admin/sms-opt-outs/[phone]` |
| `content.manage` | Manage FAQs and reviews | ✓ | ✓ |  |  |  |  | ✓ | ✓ | 6 route method(s), e.g. `PATCH /api/admin/faqs/[faqId]`; page gate: `/admin/faqs`, `/admin/reviews` |
| `analytics.spend.manage` | Record marketing spend | ✓ | ✓ |  |  |  |  | ✓ |  | 1 route method(s), e.g. `POST /api/admin/analytics/marketing-spend` |

### Conversations

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `support.conversations.handle` | Handle customer conversations | ✓ | ✓ |  |  |  | ✓ |  |  | 4 route method(s), e.g. `POST /api/admin/conversations/[conversationId]/assign`; page gate: `/admin/conversations` |

### Machines

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `machines.view` | See machines, slots and machine health | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | 11 route method(s), e.g. `GET /api/vending/kiosk-screen/images`; page gate: `/admin/vending/[machineId]` |
| `machines.create` | Register new machines | ✓ | ✓ | ✓ |  |  |  |  |  | 1 route method(s), e.g. `POST /api/vending/register`; page gate: `/admin/vending/new` |
| `machines.credentials.manage` | Rotate or revoke a machine’s screen key | ✓ | ✓ | ✓ |  |  |  |  |  | 3 route method(s), e.g. `POST /api/vending/machines/[id]/credentials/[credentialId]/revoke` |
| `machines.status.manage` | Change a machine’s status | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 1 route method(s), e.g. `PATCH /api/vending/machines/[id]` |
| `machines.decommission` | Retire a machine for good | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `PATCH /api/vending/machines/[id]` |
| `machines.relocate` | Move a machine to another location | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 2 route method(s), e.g. `PATCH /api/vending/machines/[id]` |
| `machines.commands.issue` | Send commands to a machine (restart, sync) | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 1 route method(s), e.g. `POST /api/vending/machines/[id]/commands` |
| `machines.test_vend` | Run a test vend | ✓ | ✓ | ✓ |  |  |  |  |  | 1 route method(s), e.g. `POST /api/vending/machines/[id]/testVend` |
| `machines.slots.toggle` | Switch slots on or off | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 1 route method(s), e.g. `PATCH /api/vending/machines/[id]/slots` |
| `machines.slots.configure` | Set up slots and slot mapping | ✓ | ✓ | ✓ |  |  |  |  |  | 4 route method(s), e.g. `PUT /api/vending/machines/[id]/slot-mapping` |
| `locations.view` | See locations | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  | 2 route method(s), e.g. `GET /api/vending/locations/[id]`; page gate: `/admin/vending/locations` |
| `locations.manage` | Create and edit locations | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 2 route method(s), e.g. `PATCH /api/vending/locations/[id]` |
| `alerts.view` | See machine alerts | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  | 2 route method(s), e.g. `POST /api/vending/alerts/evaluate`; page gate: `/admin/vending/alerts` |
| `alerts.resolve` | Acknowledge and resolve alerts | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  | 2 route method(s), e.g. `POST /api/vending/alerts/[id]/acknowledge` |
| `cameras.view` | See cameras and snapshots | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  | 4 route method(s), e.g. `GET /api/vending/cameras/[cameraId]` |
| `cameras.operate` | Take snapshots and test cameras | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  | 3 route method(s), e.g. `POST /api/vending/cameras/[cameraId]/health-check` |
| `cameras.manage` | Add, configure and disable cameras | ✓ | ✓ | ✓ |  |  |  |  |  | 4 route method(s), e.g. `POST /api/vending/cameras/[cameraId]/activate` |

### Machine stock & catalogue

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `machine_catalog.manage` | Choose what each machine sells | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 3 route method(s), e.g. `PATCH /api/vending/machines/[id]/assortment/[productCatalogue]/[productId]` |
| `machine_screen.manage` | Edit the customer screen (artwork, product text) | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  | 4 route method(s), e.g. `PATCH /api/vending/kiosk-screen/images/[imageId]`; page gate: `/admin/vending/kiosk-screen` |
| `pricing.manage` | Change machine prices | ✓ | ✓ | ✓ |  |  |  |  |  | 5 route method(s), e.g. `PATCH /api/vending/machines/[id]/assortment/[productCatalogue]/[productId]` |
| `machine_inventory.adjust` | Correct machine stock counts | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 2 route method(s), e.g. `POST /api/vending/machines/[id]/slots/adjust` |
| `machine_inventory.export` | Download machine stock movements | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `GET /api/vending/machines/[id]/stock-movements/export` |
| `restock.view` | See restock tasks | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 1 route method(s), e.g. `GET /api/vending/restock`; page gate: `/admin/vending/restock` |
| `restock.plan` | Create, approve and cancel restock tasks | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 3 route method(s), e.g. `POST /api/vending/restock/[taskId]/approve` |
| `restock.execute` | Pick, dispatch and receive restocks | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 4 route method(s), e.g. `POST /api/vending/restock/[taskId]/dispatch` |
| `analytics.vending.view` | See machine sales intelligence | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  | 11 route method(s), e.g. `GET /api/vending/analytics`; page gate: `/admin/vending/intelligence` |
| `recommendations.act` | Generate and act on recommendations | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 4 route method(s), e.g. `POST /api/vending/recommendations/[id]/approve` |

### Machine sales & owners

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `sales.view` | See machine sales | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  | 3 route method(s), e.g. `GET /api/vending/reconciliation`; page gate: `/admin/vending/reconciliation`, `/admin/vending/sales`, `/admin/vending/trace` |
| `sales.export` | Download machine sales | ✓ | ✓ |  |  | ✓ |  |  |  | 1 route method(s), e.g. `GET /api/vending/sales/export` |
| `sales.review.resolve` | Decide sales under review | ✓ | ✓ |  |  | ✓ |  |  |  | 1 route method(s), e.g. `POST /api/vending/sales/[id]/resolve` |
| `sales.refund` | Send refunds to machine customers | ✓ | ✓ |  |  | ✓ |  |  |  | 1 route method(s), e.g. `POST /api/vending/sales/[id]/resolve` |
| `owners.view` | See machine owners | ✓ | ✓ | ✓ |  | ✓ |  |  |  | 2 route method(s), e.g. `GET /api/vending/partners/[partnerId]/agreements`; page gate: `/admin/vending/partners` |
| `owners.manage` | Add and edit machine owners and agreements | ✓ | ✓ |  |  |  |  |  |  | 6 route method(s), e.g. `PATCH /api/vending/machines/[id]/owner`; page gate: `/admin/vending/partners/new` |
| `owners.export` | Download the machine owner list | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `GET /api/vending/partners/export` |
| `owner_finance.view` | See owner wallets, settlements and subscriptions | ✓ | ✓ |  |  | ✓ |  |  |  | 8 route method(s), e.g. `GET /api/vending/machines/[id]/settlements`; page gate: `/admin/vending/partners/[partnerId]/settlements`, `/admin/vending/settlements` |
| `owner_finance.subscriptions.manage` | Manage owner subscriptions | ✓ | ✓ |  |  |  |  |  |  | 2 route method(s), e.g. `PATCH /api/vending/machines/[id]/subscription/[subscriptionId]` |
| `owner_finance.settlements.manage` | Prepare owner settlements | ✓ | ✓ |  |  |  |  |  |  | 4 route method(s), e.g. `POST /api/vending/machines/[id]/settlements/preview` |
| `owner_finance.settlements.finalize` | Finalize settlements (credits the owner) | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `POST /api/vending/settlements/[id]/finalize` |
| `owner_finance.payouts.request` | Request payouts for owners | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `POST /api/vending/partners/[partnerId]/withdrawals` |

### Manufacturers & integrations

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `integrations.view` | See manufacturers and machine integrations | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 4 route method(s), e.g. `GET /api/vending/integrations/manufacturers/[id]`; page gate: `/admin/vending/integrations` |
| `integrations.manufacturers.manage` | Add and edit manufacturers | ✓ | ✓ |  |  |  |  |  |  | 4 route method(s), e.g. `PATCH /api/vending/integrations/manufacturers/[id]` |
| `integrations.models.manage` | Add and edit machine models | ✓ | ✓ |  |  |  |  |  |  | 2 route method(s), e.g. `PATCH /api/vending/integrations/models/[id]` |
| `integrations.certify` | Certify models and run certification | ✓ | ✓ |  |  |  |  |  |  | 5 route method(s), e.g. `POST /api/vending/integrations/models/[id]/certify` |
| `integrations.credentials.manage` ⚠︎SA | Issue, rotate and revoke manufacturer keys | ✓ |  |  |  |  |  |  |  | 7 route method(s), e.g. `POST /api/vending/integrations/credentials/[keyId]/revoke`; page gate: `/admin/vending/integrations/credentials` |
| `integrations.machines.configure` | Connect a machine to its manufacturer | ✓ | ✓ | ✓ |  |  |  |  |  | 1 route method(s), e.g. `PUT /api/vending/machines/[id]/integration` |
| `integrations.machines.activate` | Activate, suspend and test machine integrations | ✓ | ✓ | ✓ |  |  |  |  |  | 3 route method(s), e.g. `POST /api/vending/machines/[id]/integration/activate` |
| `integrations.machines.maintenance` | Put a machine into maintenance | ✓ | ✓ | ✓ | ✓ |  |  |  |  | 1 route method(s), e.g. `PUT /api/vending/machines/[id]/integration/maintenance` |

### System

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `search.use` | Search across the admin | ✓ | ✓ |  |  |  |  | ✓ | ✓ | 1 route method(s), e.g. `GET /api/admin/search` |
| `audit.view` | See the audit log | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `GET /api/admin/audit-logs`; page gate: `/admin/audit-logs` |
| `audit.export` | Download the audit log | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `GET /api/admin/audit-logs/export` |
| `settings.view` | See settings, jobs and storage | ✓ | ✓ |  |  |  |  |  |  | 3 route method(s), e.g. `GET /api/admin/feature-flags`; page gate: `/admin/operations`, `/admin/settings`, `/admin/storage` |
| `ops.jobs.run` | Run scheduled jobs now and rebuild analytics | ✓ | ✓ |  |  |  |  |  |  | 2 route method(s), e.g. `POST /api/admin/jobs/[jobName]/run` |
| `settings.manage` | Change business settings and feature flags | ✓ | ✓ |  |  |  |  |  |  | 2 route method(s), e.g. `PATCH /api/admin/feature-flags` |
| `settings.storage.manage` | Delete stored files | ✓ | ✓ |  |  |  |  |  |  | 1 route method(s), e.g. `DELETE /api/admin/storage` |
| `settings.integrations.manage` ⚠︎SA | Change payment, SMS and WhatsApp credentials | ✓ |  |  |  |  |  |  |  | 5 route method(s), e.g. `GET /api/admin/integrations/[provider]` |
| `settings.notifications.manage` ⚠︎SA | Edit notification templates | ✓ |  |  |  |  |  |  |  | 3 route method(s), e.g. `GET /api/admin/notification-templates/[code]`; page gate: `/admin/notification-templates` |

### Staff

| Permission | Meaning | SA | Adm | Ops | Wh | Fin | Sup | Mkt | PM | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|
| `users.manage` ⚠︎SA | Invite staff and change their access | ✓ |  |  |  |  |  |  |  | 6 route method(s), e.g. `PATCH /api/admin/staff/[uid]/access` |
| `users.view_as` ⚠︎SA | View the admin as another role | ✓ |  |  |  |  |  |  |  | 1 route method(s), e.g. `POST /api/admin/view-as` |

