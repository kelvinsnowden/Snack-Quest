# Admin capability matrix

Generated from the code (`app/api/**/route.ts`, per HTTP method) for `docs/FINAL_OS_FUNCTIONALITY_AUDIT.md`. One row per route method.

**Columns:**
- **Backend:** the first service or repository call in the route.
- **UI:** the first component or page that calls it, and how many others do (`c/` = `components/`).
- **Permission:** the permission the method checks, or how a system interface authenticates.
- **Audit:** `audit log` = a central entry is written by the route. `service log` / `record trail` = the service writes its own log, or the record keeps a history. `none` = neither.
- **Reversible:** a heuristic from the action's name; the audit document gives the real answer for money actions.
- **Role(s):** templates holding the permission (Super admin holds everything and is omitted).

**Status:**
- Complete: guarded, has a UI caller and, for writes, an audit entry.
- Works, unaudited: a write without a central entry.
- Read API: pages read the same service directly.
- System interface: cron, device, machine API, owner portal, webhooks, public.

Regenerate after route changes; don't edit by hand.

| Status | Route methods |
|---|---:|
| Complete | 197 |
| System interface | 81 |
| Works, unaudited | 41 |
| Read API (pages read the service directly) | 21 |

## Admin (shop, staff, settings) — `/api/admin`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Record marketing spend | `businessAnalyticsService.setMarketingSpend` | `POST /api/admin/analytics/marketing-spend` | c/admin/MarketingSpendForm.tsx | `analytics.spend.manage` | audit log | Partly (edit/cancel) | Admin; Marketing | Complete |
| See the audit log | `auditLogRepository.search` | `GET /api/admin/audit-logs` | — | `audit.view` | n/a | n/a (read) | Admin | Read API (pages read the service directly) |
| Download the audit log | `auditLogRepository.search` | `GET /api/admin/audit-logs/export` | — | `audit.export` | n/a | n/a (read) | Admin | Read API (pages read the service directly) |
| Manage campaigns and referral links | `campaignService.createCampaign` | `POST /api/admin/campaigns` | c/admin/CampaignForm.tsx | `marketing.campaigns.manage` | audit log | Partly (edit/cancel) | Admin; Marketing | Complete |
| Manage campaigns and referral links | `campaignRepository.findById` | `PATCH /api/admin/campaigns/[campaignId]` | c/admin/CampaignForm.tsx | `marketing.campaigns.manage` | audit log | Yes (edit again) | Admin; Marketing | Complete |
| Handle customer conversations | `conversationService.adminAssignAgent` | `POST /api/admin/conversations/[conversationId]/assign` | c/admin/ConversationAgentActions.tsx | `support.conversations.handle` | none | Partly (edit/cancel) | Admin; Support | Works, unaudited |
| Handle customer conversations | `conversationService.adminPriceDoorDelivery` | `POST /api/admin/conversations/[conversationId]/price-door-delivery` | c/admin/ConversationAgentActions.tsx +1 | `support.conversations.handle` | audit log | Partly (edit/cancel) | Admin; Support | Complete |
| Handle customer conversations | `conversationService.sendAgentReply` | `POST /api/admin/conversations/[conversationId]/reply` | c/admin/ConversationAgentActions.tsx +1 | `support.conversations.handle` | none | Partly (edit/cancel) | Admin; Support | Works, unaudited |
| Handle customer conversations | `conversationService.adminReturnToBot` | `POST /api/admin/conversations/[conversationId]/return-to-bot` | c/admin/ConversationAgentActions.tsx | `support.conversations.handle` | none | Partly (edit/cancel) | Admin; Support | Works, unaudited |
| Approve, pause and remove creators | `creatorAdminService.updateStatus` | `POST /api/admin/creators/[uid]/status` | c/admin/CreatorStatusActions.tsx | `creators.manage` | audit log | Yes (inverse action) | Admin; Marketing | Complete |
| See customers and wallets | `walletService.getBalance` | `GET /api/admin/customers/[phoneNumber]/wallet` | c/admin/CustomerWalletCard.tsx | `customers.view` | n/a | n/a (read) | Admin; Marketing | Complete |
| Adjust customer wallets | `walletService.getBalance` | `POST /api/admin/customers/[phoneNumber]/wallet` | c/admin/CustomerWalletCard.tsx | `customers.wallet.adjust` | audit log | Partly (edit/cancel) | Admin | Complete |
| See delivery zones | `deliveryZoneService.listZones` | `GET /api/admin/delivery-zones` | c/admin/DeliveryZoneTable.tsx | `logistics.view` | n/a | n/a (read) | Admin | Complete |
| Manage delivery zones, batches and shipments | `deliveryZoneService.listZones` | `PATCH /api/admin/delivery-zones` | c/admin/DeliveryZoneTable.tsx | `logistics.manage` | audit log | Yes (edit again) | Admin | Complete |
| Manage discount codes | `discountCodeRepository.listByBusiness` | `GET /api/admin/discount-codes` | c/admin/DiscountCodesManager.tsx | `marketing.discounts.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Manage discount codes | `discountCodeRepository.listByBusiness` | `PATCH /api/admin/discount-codes` | c/admin/DiscountCodesManager.tsx | `marketing.discounts.manage` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Manage discount codes | `discountCodeRepository.listByBusiness` | `POST /api/admin/discount-codes` | c/admin/DiscountCodesManager.tsx | `marketing.discounts.manage` | audit log | Partly (edit/cancel) | Super admin only (grantable) | Complete |
| Manage FAQs and reviews | `faqRepository.create` | `POST /api/admin/faqs` | c/admin/FaqFormDialog.tsx | `content.manage` | audit log | Partly (edit/cancel) | Admin; Marketing; Product manager | Complete |
| Manage FAQs and reviews | `faqRepository.findById` | `DELETE /api/admin/faqs/[faqId]` | c/admin/FaqFormDialog.tsx +1 | `content.manage` | audit log | No (removal) | Admin; Marketing; Product manager | Complete |
| Manage FAQs and reviews | `faqRepository.findById` | `PATCH /api/admin/faqs/[faqId]` | c/admin/FaqFormDialog.tsx +1 | `content.manage` | audit log | Yes (edit again) | Admin; Marketing; Product manager | Complete |
| See settings, jobs and storage | `featureFlagService.listFlags` | `GET /api/admin/feature-flags` | c/admin/FeatureFlagList.tsx | `settings.view` | n/a | n/a (read) | Admin | Complete |
| Change business settings and feature flags | `featureFlagService.listFlags` | `PATCH /api/admin/feature-flags` | c/admin/FeatureFlagList.tsx | `settings.manage` | audit log | Yes (edit again) | Admin | Complete |
| Manage delivery zones, batches and shipments | `fulfillmentBatchService.createFulfillmentBatch` | `POST /api/admin/fulfillment-batches` | c/admin/FulfillmentBatchForm.tsx | `logistics.manage` | audit log | Partly (edit/cancel) | Admin | Complete |
| Change payment, SMS and WhatsApp credentials | `integrationSettingsService.listSummaries` | `GET /api/admin/integrations` | — | `settings.integrations.manage` | n/a | n/a (read) | Super admin only (grantable) | Read API (pages read the service directly) |
| Change payment, SMS and WhatsApp credentials | `integrationSettingsService.getSummary` | `GET /api/admin/integrations/[provider]` | c/admin/IntegrationCard.tsx +1 | `settings.integrations.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Change payment, SMS and WhatsApp credentials | `integrationSettingsService.getSummary` | `PATCH /api/admin/integrations/[provider]` | c/admin/IntegrationCard.tsx +1 | `settings.integrations.manage` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Change payment, SMS and WhatsApp credentials | `integrationSettingsService.testConnection` | `POST /api/admin/integrations/[provider]/test` | c/admin/IntegrationCard.tsx | `settings.integrations.manage` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Adjust and write off warehouse stock | `InventoryService.adjustStock` | `POST /api/admin/inventory/[packageId]/adjust` | c/admin/InventoryAdjustDialog.tsx | `warehouse_inventory.adjust` | none | Partly (edit/cancel) | Admin | Works, unaudited |
| Adjust and write off warehouse stock | `inventoryService.writeOffBatch` | `POST /api/admin/inventory/batches/[batchId]/write-off` | c/admin/WriteOffBatchDialog.tsx | `warehouse_inventory.adjust` | audit log | No (one-way) | Admin | Complete |
| Run scheduled jobs now and rebuild analytics | `scheduledJobService.run` | `POST /api/admin/jobs/[jobName]/run` | c/admin/JobControls.tsx | `ops.jobs.run` | audit log | No (one-way) | Admin | Complete |
| Write | `—` | `POST /api/admin/locale` | c/admin/LanguageToggle.tsx | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |
| Write marketing emails and SMS | `marketingEmailService.listCampaigns` | `GET /api/admin/marketing-emails` | c/admin/MarketingEmailForm.tsx +1 | `marketing.messages.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingEmailService.listCampaigns` | `POST /api/admin/marketing-emails` | c/admin/MarketingEmailForm.tsx +1 | `marketing.messages.manage` | audit log | Partly (edit/cancel) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingEmailService.getCampaign` | `DELETE /api/admin/marketing-emails/[id]` | c/admin/CreatorPicker.tsx +2 | `marketing.messages.manage` | audit log | No (removal) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingEmailService.getCampaign` | `GET /api/admin/marketing-emails/[id]` | c/admin/CreatorPicker.tsx +2 | `marketing.messages.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingEmailService.getCampaign` | `PATCH /api/admin/marketing-emails/[id]` | c/admin/CreatorPicker.tsx +2 | `marketing.messages.manage` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Send marketing emails and SMS | `marketingEmailService.resendFailed` | `POST /api/admin/marketing-emails/[id]/resend` | c/admin/ResendFailedButton.tsx | `marketing.messages.send` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Send marketing emails and SMS | `marketingEmailService.send` | `POST /api/admin/marketing-emails/[id]/send` | c/admin/MarketingEmailForm.tsx | `marketing.messages.send` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingEmailService.searchCreators` | `GET /api/admin/marketing-emails/creator-search` | c/admin/CreatorPicker.tsx +2 | `marketing.messages.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingEmailService.previewRecipientCount` | `POST /api/admin/marketing-emails/recipients` | c/admin/MarketingEmailForm.tsx +1 | `marketing.messages.manage` | none | Partly (edit/cancel) | Super admin only (grantable) | Works, unaudited |
| Write marketing emails and SMS | `marketingSmsService.listCampaigns` | `GET /api/admin/marketing-sms` | c/admin/MarketingSmsComposer.tsx +1 | `marketing.messages.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingSmsService.listCampaigns` | `POST /api/admin/marketing-sms` | c/admin/MarketingSmsComposer.tsx +1 | `marketing.messages.manage` | audit log | Partly (edit/cancel) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingSmsService.getCampaign` | `DELETE /api/admin/marketing-sms/[id]` | c/admin/MarketingSmsComposer.tsx +1 | `marketing.messages.manage` | audit log | No (removal) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingSmsService.getCampaign` | `GET /api/admin/marketing-sms/[id]` | c/admin/MarketingSmsComposer.tsx +1 | `marketing.messages.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingSmsService.getCampaign` | `PATCH /api/admin/marketing-sms/[id]` | c/admin/MarketingSmsComposer.tsx +1 | `marketing.messages.manage` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Send marketing emails and SMS | `marketingSmsService.resendFailed` | `POST /api/admin/marketing-sms/[id]/resend` | c/admin/MarketingSmsResult.tsx | `marketing.messages.send` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Send marketing emails and SMS | `marketingSmsService.send` | `POST /api/admin/marketing-sms/[id]/send` | c/admin/MarketingSmsComposer.tsx +1 | `marketing.messages.send` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Write marketing emails and SMS | `marketingSmsService.previewAudience` | `POST /api/admin/marketing-sms/preview` | c/admin/MarketingSmsComposer.tsx +1 | `marketing.messages.manage` | none | Partly (edit/cancel) | Super admin only (grantable) | Works, unaudited |
| Edit notification templates | `notificationTemplateService.listAll` | `GET /api/admin/notification-templates` | — | `settings.notifications.manage` | n/a | n/a (read) | Super admin only (grantable) | Read API (pages read the service directly) |
| Edit notification templates | `notificationTemplateService.getByCode` | `GET /api/admin/notification-templates/[code]` | c/admin/NotificationTemplateForm.tsx | `settings.notifications.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Edit notification templates | `notificationTemplateService.getByCode` | `PATCH /api/admin/notification-templates/[code]` | c/admin/NotificationTemplateForm.tsx | `settings.notifications.manage` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Change what is in an order’s box | `orderService.changeBox` | `PATCH /api/admin/orders/[orderId]/box` | c/admin/ChangeOrderBoxDialog.tsx | `orders.contents.edit` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Record payment collected on delivery | `orderRepository.findById` | `POST /api/admin/orders/[orderId]/collect-payment` | c/warehouse/CollectPaymentButton.tsx | `orders.collect_payment` | none | No (one-way) | Admin; Warehouse | Works, unaudited |
| Record an order as already paid | `paymentService.correctManualPayment` | `PATCH /api/admin/orders/[orderId]/manual-payment` | c/admin/CorrectManualPaymentDialog.tsx | `payments.record_manual` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Refund box orders | `refundService.requestRefund` | `POST /api/admin/orders/[orderId]/refund` | c/admin/RefundActions.tsx | `orders.refund` | audit log | No (one-way) | Admin | Complete |
| Resend order confirmations | `orderService.sendConfirmationSms` | `POST /api/admin/orders/[orderId]/send-confirmation-sms` | c/admin/SendConfirmationSmsButton.tsx | `orders.notify` | audit log | No (one-way) | Admin | Complete |
| Move orders through fulfilment | `orderService.updateStatus` | `POST /api/admin/orders/[orderId]/status` | c/admin/OrderStatusActions.tsx +1 | `orders.status.update` | none | Yes (inverse action) | Admin; Warehouse | Works, unaudited |
| Import fulfilment costs in bulk | `orderRepository.findById` | `POST /api/admin/orders/costs/bulk` | c/admin/BulkOrderCostsForm.tsx | `orders.costs.bulk` | none | Partly (edit/cancel) | Admin | Works, unaudited |
| Write | `conversationService.startWebCheckout` | `POST /api/admin/orders/initiate` | c/admin/StaffInitiatedOrderDialog.tsx | `orders.create, payments.record_manual` | none | Partly (edit/cancel) | Admin | Works, unaudited |
| Complete or reconcile stuck payments | `paymentService.completeManually` | `POST /api/admin/payments/[intentId]/complete` | c/admin/ReconcileNowButton.tsx | `payments.reconcile` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Complete or reconcile stuck payments | `paymentService.reconcileStuckIntents` | `POST /api/admin/payments/reconcile` | c/admin/ReconcileNowButton.tsx | `payments.reconcile` | audit log | Partly (edit/cancel) | Super admin only (grantable) | Complete |
| See products and snacks | `snackItemRepository.listForStaffPacking` | `GET /api/admin/premium-snacks` | c/admin/StaffSnackPicker.tsx | `products.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Marketing; Product manager | Complete |
| Create and edit boxes | `productService.createProduct` | `POST /api/admin/products` | c/admin/ProductForm.tsx | `products.manage` | audit log | Partly (edit/cancel) | Admin; Product manager | Complete |
| Create and edit boxes | `productService.updateProduct` | `PATCH /api/admin/products/[packageId]` | c/admin/ProductActiveToggle.tsx +1 | `products.manage` | audit log | Yes (edit again) | Admin; Product manager | Complete |
| Manage suppliers and purchase orders | `purchaseOrderService.createPurchaseOrder` | `POST /api/admin/purchase-orders` | c/admin/PurchaseOrderForm.tsx | `procurement.manage` | audit log | Partly (edit/cancel) | Admin | Complete |
| Manage suppliers and purchase orders | `purchaseOrderService.cancelPurchaseOrder` | `POST /api/admin/purchase-orders/[purchaseOrderId]/cancel` | c/admin/PurchaseOrderActions.tsx | `procurement.manage` | audit log | Yes (inverse action) | Admin | Complete |
| Manage suppliers and purchase orders | `purchaseOrderService.markOrdered` | `POST /api/admin/purchase-orders/[purchaseOrderId]/order` | c/admin/PurchaseOrderActions.tsx | `procurement.manage` | audit log | Partly (edit/cancel) | Admin | Complete |
| Manage suppliers and purchase orders | `purchaseOrderService.receivePurchaseOrder` | `POST /api/admin/purchase-orders/[purchaseOrderId]/receive` | c/admin/PurchaseOrderActions.tsx | `procurement.manage` | audit log | No (one-way) | Admin | Complete |
| Edit box recipes | `recipeService.saveRecipe` | `DELETE /api/admin/recipes/[packageId]` | c/admin/BoxRecipeBuilder.tsx | `products.recipes.manage` | audit log | No (removal) | Admin; Product manager | Complete |
| Edit box recipes | `recipeService.saveRecipe` | `PUT /api/admin/recipes/[packageId]` | c/admin/BoxRecipeBuilder.tsx | `products.recipes.manage` | audit log | Yes (edit again) | Admin; Product manager | Complete |
| Resolve payment reconciliation issues | `webhookEventRepository.markResolved` | `POST /api/admin/reconciliation/resolve` | c/admin/ResolveUnmatchedPaymentDialog.tsx | `finance.reconciliation.resolve` | audit log | No (one-way) | Admin | Complete |
| Manage campaigns and referral links | `referralService.setActive` | `PATCH /api/admin/referral-links/[linkId]` | c/admin/ReferralLinkActiveToggle.tsx | `marketing.campaigns.manage` | record trail | Yes (edit again) | Admin; Marketing | Complete |
| Manage FAQs and reviews | `reviewService.addFromStaff` | `POST /api/admin/reviews` | c/admin/AddWhatsAppReviewForm.tsx | `content.manage` | none | Partly (edit/cancel) | Admin; Marketing; Product manager | Works, unaudited |
| Manage FAQs and reviews | `reviewService.moderate` | `PATCH /api/admin/reviews/[reviewId]` | c/admin/ReviewModerationCard.tsx | `content.manage` | none | Yes (edit again) | Admin; Marketing; Product manager | Works, unaudited |
| Manage FAQs and reviews | `reviewService.markReviewRequested` | `POST /api/admin/reviews/requests/[orderId]` | c/admin/ReviewRequestList.tsx | `content.manage` | none | Partly (edit/cancel) | Admin; Marketing; Product manager | Works, unaudited |
| Search across the admin | `globalSearchService.search` | `GET /api/admin/search` | c/admin/GlobalSearchDialog.tsx | `search.use` | n/a | n/a (read) | Admin; Marketing; Product manager | Complete |
| See settings, jobs and storage | `businessSettingsService.getSettings` | `GET /api/admin/settings` | c/admin/BusinessSettingsForm.tsx +1 | `settings.view` | n/a | n/a (read) | Admin | Complete |
| Change business settings and feature flags | `businessSettingsService.getSettings` | `PATCH /api/admin/settings` | c/admin/BusinessSettingsForm.tsx +1 | `settings.manage` | audit log | Yes (edit again) | Admin | Complete |
| Book couriers | `deliveryService.completeManualBooking` | `POST /api/admin/shipments/[shipmentId]/complete-booking` | c/admin/CompleteManualBookingDialog.tsx | `logistics.courier.book` | none | No (one-way) | Admin; Warehouse; Support | Works, unaudited |
| Manage delivery zones, batches and shipments | `deliveryService.updateShipmentStatus` | `POST /api/admin/shipments/[shipmentId]/status` | c/admin/ShipmentStatusActions.tsx | `logistics.manage` | none | Yes (inverse action) | Admin | Works, unaudited |
| See and add SMS opt-outs | `smsOptOutRepository.listByBusiness` | `GET /api/admin/sms-opt-outs` | c/admin/SmsOptOutManager.tsx | `marketing.optouts.manage` | n/a | n/a (read) | Admin; Marketing | Complete |
| Write | `smsOptOutRepository.listByBusiness` | `POST /api/admin/sms-opt-outs` | c/admin/SmsOptOutManager.tsx | `admin, marketing.optouts.manage` | audit log | Partly (edit/cancel) |  | Complete |
| Remove an SMS opt-out | `smsOptOutRepository.findOne` | `DELETE /api/admin/sms-opt-outs/[phone]` | c/admin/SmsOptOutManager.tsx | `marketing.optouts.remove` | audit log | No (removal) | Super admin only (grantable) | Complete |
| See products and snacks | `recipeService.listSnackItems` | `GET /api/admin/snack-items` | c/admin/SnackCatalogue.tsx | `products.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Marketing; Product manager | Complete |
| Create and edit snacks | `recipeService.listSnackItems` | `POST /api/admin/snack-items` | c/admin/SnackCatalogue.tsx | `products.snacks.manage` | audit log | Partly (edit/cancel) | Admin; Product manager | Complete |
| Create and edit snacks | `recipeService.getSnackItem` | `DELETE /api/admin/snack-items/[id]` | c/admin/SnackCatalogue.tsx | `products.snacks.manage` | audit log | No (removal) | Admin; Product manager | Complete |
| Create and edit snacks | `recipeService.getSnackItem` | `PATCH /api/admin/snack-items/[id]` | c/admin/SnackCatalogue.tsx | `products.snacks.manage` | audit log | Yes (edit again) | Admin; Product manager | Complete |
| Invite staff and change their access | `staffManagementService.listStaff` | `GET /api/admin/staff` | c/admin/InviteStaffDialog.tsx | `users.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Invite staff and change their access | `staffManagementService.listStaff` | `POST /api/admin/staff` | c/admin/InviteStaffDialog.tsx | `users.manage` | audit log | Partly (edit/cancel) | Super admin only (grantable) | Complete |
| Invite staff and change their access | `staffManagementService.changeRole` | `DELETE /api/admin/staff/[uid]` | c/admin/StaffTable.tsx | `users.manage` | audit log | No (removal) | Super admin only (grantable) | Complete |
| Invite staff and change their access | `staffManagementService.changeRole` | `PATCH /api/admin/staff/[uid]` | c/admin/StaffTable.tsx | `users.manage` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Invite staff and change their access | `staffManagementService.setAccess` | `PATCH /api/admin/staff/[uid]/access` | c/admin/AccessEditor.tsx | `users.manage` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Invite staff and change their access | `staffManagementService.resetPassword` | `POST /api/admin/staff/[uid]/reset-password` | c/admin/StaffTable.tsx | `users.manage` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Delete stored files | `storageService.listFiles` | `DELETE /api/admin/storage` | c/admin/StorageObjectActions.tsx | `settings.storage.manage` | audit log | No (removal) | Admin | Complete |
| See settings, jobs and storage | `storageService.listFiles` | `GET /api/admin/storage` | c/admin/StorageObjectActions.tsx | `settings.view` | n/a | n/a (read) | Admin | Complete |
| Manage suppliers and purchase orders | `supplierService.createSupplier` | `POST /api/admin/suppliers` | c/admin/SupplierFormDialog.tsx | `procurement.manage` | audit log | Partly (edit/cancel) | Admin | Complete |
| Manage suppliers and purchase orders | `supplierService.updateSupplier` | `PATCH /api/admin/suppliers/[supplierId]` | c/admin/SupplierFormDialog.tsx | `procurement.manage` | audit log | Yes (edit again) | Admin | Complete |
| View the admin as another role | `—` | `POST /api/admin/view-as` | c/admin/ViewAsSwitcher.tsx | `users.view_as` | none | Partly (edit/cancel) | Super admin only (grantable) | Works, unaudited |
| Change payment, SMS and WhatsApp credentials | `—` | `POST /api/admin/whatchimp/send-test-message` | c/admin/WhatchimpTestMessageAction.tsx | `settings.integrations.manage` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Approve and pay creator withdrawals | `withdrawalService.approveWithdrawal` | `POST /api/admin/withdrawals/[withdrawalId]/approve` | c/admin/WithdrawalActions.tsx | `finance.withdrawals.approve` | audit log | No (one-way) | Admin | Complete |
| Approve and pay creator withdrawals | `withdrawalService.payWithdrawalManually` | `POST /api/admin/withdrawals/[withdrawalId]/pay-manually` | c/admin/WithdrawalActions.tsx | `finance.withdrawals.approve` | audit log | No (one-way) | Admin | Complete |
| Approve and pay creator withdrawals | `withdrawalService.rejectWithdrawal` | `POST /api/admin/withdrawals/[withdrawalId]/reject` | c/admin/WithdrawalActions.tsx | `finance.withdrawals.approve` | audit log | No (one-way) | Admin | Complete |
| Approve and pay creator withdrawals | `withdrawalService.resolveAmbiguousWithdrawal` | `POST /api/admin/withdrawals/[withdrawalId]/resolve` | c/admin/WithdrawalResolveActions.tsx | `finance.withdrawals.approve` | audit log | No (one-way) | Admin | Complete |

## Analytics — `/api/analytics`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `analyticsEventService.record` | `POST /api/analytics/event` | lib/analytics/trackEvent.ts | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |
| Write | `pageViewService.record` | `POST /api/analytics/track` | c/marketing/analytics/PageViewTracker.tsx | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |

## Auth — `/api/auth`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `—` | `POST /api/auth/logout` | c/admin/AdminUserMenu.tsx | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |
| Write | `staffAuthService.establishSession` | `POST /api/auth/session` | c/admin/AcceptInviteForm.tsx +2 | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |

## Checkout — `/api/checkout`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `conversationService.start` | `POST /api/checkout/pay` | app/api-docs/page.tsx | `shared secret` | none | Partly (edit/cancel) | — | System interface |
| Write | `businessRepository.findByWhatsappPhoneNumberId` | `POST /api/checkout/start` | app/api-docs/page.tsx | `public/other` | none | Partly (edit/cancel) | — | System interface |
| Write | `conversationService.startWebCheckout` | `POST /api/checkout/web` | c/checkout/CheckoutForm.tsx | `public/other` | none | Partly (edit/cancel) | — | System interface |
| Read | `paymentService.recoverProcessingPayment` | `GET /api/checkout/web/[sessionId]` | c/checkout/PaymentWaiting.tsx +1 | `public/other` | n/a | n/a (read) | — | System interface |
| Write | `conversationService.quoteWebCheckout` | `POST /api/checkout/web/quote` | c/checkout/PaymentWaiting.tsx +1 | `public/other` | none | Partly (edit/cancel) | — | System interface |

## Conversations — `/api/conversations`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `—` | `POST /api/conversations/turn` | — | `bridge key` | none | Partly (edit/cancel) | — | System interface |

## Creator — `/api/creator`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `campaignService.submitDeliverable` | `POST /api/creator/campaign-submissions` | c/creator/SubmitDeliverableDialog.tsx | `public/other` | none | Partly (edit/cancel) | — | System interface |
| Write | `—` | `POST /api/creator/logout` | c/creator/CreatorUserMenu.tsx | `public/other` | none | Partly (edit/cancel) | — | System interface |
| Write | `creatorProfileService.completeOnboarding` | `POST /api/creator/onboarding` | c/creator/OnboardingForm.tsx | `public/other` | none | Partly (edit/cancel) | — | System interface |
| Write | `creatorProfileService.updatePhoto` | `PATCH /api/creator/photo` | c/creator/AvatarUpload.tsx | `public/other` | none | Yes (edit again) | — | System interface |
| Write | `creatorProfileService.updateProfile` | `PATCH /api/creator/profile` | c/creator/ProfileForm.tsx | `public/other` | none | Yes (edit again) | — | System interface |
| Read | `referralCodeService.checkAvailability` | `GET /api/creator/referral-code` | c/creator/ReferralCodeField.tsx | `public/other` | n/a | n/a (read) | — | System interface |
| Write | `creatorAuthService.register` | `POST /api/creator/register` | c/creator/CreatorRegisterForm.tsx | `public/other` | none | Partly (edit/cancel) | — | System interface |
| Write | `creatorAuthService.login` | `POST /api/creator/session` | c/creator/CreatorLoginForm.tsx +1 | `public/other` | none | Partly (edit/cancel) | — | System interface |
| Write | `withdrawalService.requestWithdrawal` | `POST /api/creator/withdrawals` | c/creator/RequestWithdrawalDialog.tsx | `public/other` | record trail | No (one-way) | — | System interface |

## Scheduled jobs — `/api/cron`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Read | `scheduledJobService.run` | `GET /api/cron/generate-recommendations` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.health` | `GET /api/cron/health` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.run` | `GET /api/cron/rebuild-analytics-rollups` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.run` | `GET /api/cron/rebuild-vending-rollups` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.run` | `GET /api/cron/reconcile-stk-payments` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.run` | `GET /api/cron/reconcile-stuck-withdrawals` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.run` | `GET /api/cron/reconcile-subscription-arrears` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.run` | `GET /api/cron/reconcile-vending-commands` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.run` | `GET /api/cron/reconcile-vending-transactions` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.run` | `GET /api/cron/retry-notifications` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |
| Read | `scheduledJobService.run` | `GET /api/cron/vending-fast-recovery` | — | `CRON_SECRET` | n/a | n/a (read) | — | System interface |

## Internal — `/api/internal`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `ConversationService.priceDoorDelivery` | `POST /api/internal/conversations/[conversationId]/price-door-delivery` | — | `CRON_SECRET` | none | Partly (edit/cancel) | — | System interface |

## Invest — `/api/invest`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `investorInterestService.submit` | `POST /api/invest/interest` | c/marketing/invest/InterestForm.tsx | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |

## Machine-owners — `/api/machine-owners`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `machineOwnerInterestService.submit` | `POST /api/machine-owners/interest` | c/marketing/own/ApplicationForm.tsx | `public/other` | none | Partly (edit/cancel) | — | System interface |

## Pickup-stations — `/api/pickup-stations`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Read | `pickupStationRepository.search` | `GET /api/pickup-stations` | c/checkout/PickupStationPicker.tsx | `public/other` | n/a | n/a (read) | — | Complete |

## Premium-snacks — `/api/premium-snacks`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Read | `snackItemRepository.listSelectableForPremium` | `GET /api/premium-snacks` | c/checkout/GuaranteedPicker.tsx | `public/other` | n/a | n/a (read) | — | Complete |

## Reviews — `/api/reviews`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `reviewService.submitReview` | `POST /api/reviews` | c/marketing/review/ReviewForm.tsx | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |
| Write | `—` | `POST /api/reviews/video` | c/marketing/review/ReviewForm.tsx | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |

## Sms — `/api/sms`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `smsOptOutRepository.recordOptOut` | `POST /api/sms/opt-out` | c/marketing/sms/OptOutConfirm.tsx | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |

## Storage — `/api/storage`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `ProductService.updateProduct` | `POST /api/storage/upload` | c/admin/CampaignForm.tsx +9 | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |

## Machine API v1 (manufacturers) — `/api/v1`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Read | `machineApiService.describe` | `GET /api/v1/machines/[machineCode]` | — | `HMAC machine key` | n/a | n/a (read) | — | System interface |
| Read | `machineApiService.listCommands` | `GET /api/v1/machines/[machineCode]/commands` | lib/vending/adapters/snackQuestGatewayAdapter.ts | `HMAC machine key` | n/a | n/a (read) | — | System interface |
| Write | `machineApiService.acknowledgeCommand` | `POST /api/v1/machines/[machineCode]/commands/[commandId]/ack` | — | `HMAC machine key` | record trail | Partly (edit/cancel) | — | System interface |
| Write | `machineApiService.reportCommandStatus` | `POST /api/v1/machines/[machineCode]/commands/[commandId]/status` | — | `HMAC machine key` | record trail | Yes (inverse action) | — | System interface |
| Write | `machineApiService.events` | `POST /api/v1/machines/[machineCode]/events` | — | `HMAC machine key` | record trail | Partly (edit/cancel) | — | System interface |
| Write | `machineApiService.heartbeat` | `POST /api/v1/machines/[machineCode]/heartbeat` | — | `HMAC machine key` | record trail | Partly (edit/cancel) | — | System interface |
| Write | `machineApiService.inventory` | `POST /api/v1/machines/[machineCode]/inventory` | — | `HMAC machine key` | record trail | Partly (edit/cancel) | — | System interface |
| Write | `machineApiService.status` | `POST /api/v1/machines/[machineCode]/status` | — | `HMAC machine key` | record trail | Yes (inverse action) | — | System interface |
| Write | `machineApiService.connect` | `POST /api/v1/machines/connect` | — | `HMAC machine key` | record trail | Partly (edit/cancel) | — | System interface |
| Write | `manufacturerWebhookService.ingest` | `POST /api/v1/webhooks/manufacturers/[slug]` | admin/vending/integrations/[manufacturerId]/page.tsx | `HMAC machine key` | none | Partly (edit/cancel) | — | System interface |

## Vending — `/api/vending`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| See machine alerts | `alertService.listOpen` | `GET /api/vending/alerts` | — | `alerts.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| Acknowledge and resolve alerts | `alertService.acknowledge` | `POST /api/vending/alerts/[id]/acknowledge` | c/admin/AlertActions.tsx | `alerts.resolve` | audit log | Partly (edit/cancel) | Admin; Machine operations; Warehouse; Finance | Complete |
| Acknowledge and resolve alerts | `alertService.resolve` | `POST /api/vending/alerts/[id]/resolve` | c/admin/AlertActions.tsx | `alerts.resolve` | audit log | No (one-way) | Admin; Machine operations; Warehouse; Finance | Complete |
| See machine alerts | `alertService.evaluateIfStale` | `POST /api/vending/alerts/evaluate` | c/admin/vending/CheckAlertsNowButton.tsx | `alerts.view` | none | No (one-way) | Admin; Machine operations; Warehouse; Finance | Works, unaudited |
| See machine sales intelligence | `machineDailySummaryRepository.listRange` | `GET /api/vending/analytics` | lib/auth/requireStaffRole.ts | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Complete |
| See cameras and snapshots | `cameraService.findById` | `GET /api/vending/cameras/[cameraId]` | c/admin/CameraActions.tsx | `cameras.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Complete |
| Add, configure and disable cameras | `cameraService.activateCamera` | `POST /api/vending/cameras/[cameraId]/activate` | c/admin/CameraActions.tsx | `cameras.manage` | audit log | Yes (inverse action) | Admin; Machine operations | Complete |
| Add, configure and disable cameras | `cameraService.configureCamera` | `PATCH /api/vending/cameras/[cameraId]/configure` | c/admin/AddCameraForm.tsx +1 | `cameras.manage` | audit log | Yes (edit again) | Admin; Machine operations | Complete |
| Add, configure and disable cameras | `cameraService.disableCamera` | `POST /api/vending/cameras/[cameraId]/disable` | c/admin/CameraActions.tsx | `cameras.manage` | audit log | Yes (inverse action) | Admin; Machine operations | Complete |
| Take snapshots and test cameras | `cameraService.runHealthCheck` | `POST /api/vending/cameras/[cameraId]/health-check` | c/admin/CameraActions.tsx | `cameras.operate` | audit log | Partly (edit/cancel) | Admin; Machine operations; Warehouse; Finance | Complete |
| Take snapshots and test cameras | `cameraService.captureSnapshot` | `POST /api/vending/cameras/[cameraId]/snapshot` | c/admin/CameraActions.tsx | `cameras.operate` | audit log | No (one-way) | Admin; Machine operations; Warehouse; Finance | Complete |
| See cameras and snapshots | `cameraService.listSnapshotsByCamera` | `GET /api/vending/cameras/[cameraId]/snapshots` | c/admin/CameraActions.tsx | `cameras.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Complete |
| See cameras and snapshots | `cameraService.getStreamInfo` | `GET /api/vending/cameras/[cameraId]/stream-info` | c/admin/CameraActions.tsx | `cameras.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Complete |
| Take snapshots and test cameras | `cameraService.testConnection` | `POST /api/vending/cameras/[cameraId]/test` | c/admin/CameraActions.tsx | `cameras.operate` | audit log | No (one-way) | Admin; Machine operations; Warehouse; Finance | Complete |
| Read | `machineCommandService.listPendingForMachine` | `GET /api/vending/commands` | — | `device key` | n/a | n/a (read) | — | System interface |
| Write | `machineCommandService.acknowledge` | `POST /api/vending/commands/[id]/ack` | — | `device key` | record trail | Partly (edit/cancel) | — | System interface |
| Write | `machineCommandService.complete` | `POST /api/vending/commands/[id]/complete` | — | `device key` | record trail | No (one-way) | — | System interface |
| Issue, rotate and revoke manufacturer keys | `integrationCredentialService.revoke` | `POST /api/vending/integrations/credentials/[keyId]/revoke` | c/admin/integrations/CredentialsPanel.tsx | `integrations.credentials.manage` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Issue, rotate and revoke manufacturer keys | `integrationCredentialService.rotate` | `POST /api/vending/integrations/credentials/[keyId]/rotate` | c/admin/integrations/CredentialsPanel.tsx | `integrations.credentials.manage` | audit log | Partly (edit/cancel) | Super admin only (grantable) | Complete |
| See manufacturers and machine integrations | `manufacturerRegistryService.listManufacturers` | `GET /api/vending/integrations/manufacturers` | c/admin/integrations/CreateManufacturerForm.tsx | `integrations.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse | Complete |
| Add and edit manufacturers | `manufacturerRegistryService.listManufacturers` | `POST /api/vending/integrations/manufacturers` | c/admin/integrations/CreateManufacturerForm.tsx | `integrations.manufacturers.manage` | audit log | Partly (edit/cancel) | Admin | Complete |
| See manufacturers and machine integrations | `manufacturerRegistryService.requireManufacturer` | `GET /api/vending/integrations/manufacturers/[id]` | c/admin/integrations/EditManufacturerForm.tsx | `integrations.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse | Complete |
| Add and edit manufacturers | `manufacturerRegistryService.requireManufacturer` | `PATCH /api/vending/integrations/manufacturers/[id]` | c/admin/integrations/EditManufacturerForm.tsx | `integrations.manufacturers.manage` | audit log | Yes (edit again) | Admin | Complete |
| Issue, rotate and revoke manufacturer keys | `manufacturerApiCredentialService.listSummaries` | `GET /api/vending/integrations/manufacturers/[id]/api-credentials` | c/admin/integrations/ManufacturerApiCredentialsPanel.tsx | `integrations.credentials.manage` | n/a | n/a (read) | Super admin only (grantable) | Complete |
| Issue, rotate and revoke manufacturer keys | `manufacturerApiCredentialService.listSummaries` | `PUT /api/vending/integrations/manufacturers/[id]/api-credentials/[environment]` | c/admin/integrations/ManufacturerApiCredentialsPanel.tsx | `integrations.credentials.manage` | audit log | Yes (edit again) | Super admin only (grantable) | Complete |
| Issue, rotate and revoke manufacturer keys | `manufacturerApiCredentialService.listSummaries` | `POST /api/vending/integrations/manufacturers/[id]/api-credentials/[environment]/revoke` | c/admin/integrations/ManufacturerApiCredentialsPanel.tsx | `integrations.credentials.manage` | audit log | No (one-way) | Super admin only (grantable) | Complete |
| Issue, rotate and revoke manufacturer keys | `manufacturerApiCredentialService.listSummaries` | `POST /api/vending/integrations/manufacturers/[id]/api-credentials/[environment]/rollback` | c/admin/integrations/ManufacturerApiCredentialsPanel.tsx | `integrations.credentials.manage` | audit log | Yes (inverse action) | Super admin only (grantable) | Complete |
| Issue, rotate and revoke manufacturer keys | `integrationCredentialService.issue` | `POST /api/vending/integrations/manufacturers/[id]/credentials` | c/admin/integrations/CredentialsPanel.tsx | `integrations.credentials.manage` | audit log | Partly (edit/cancel) | Super admin only (grantable) | Complete |
| Add and edit manufacturers | `manufacturerRegistryService.requireManufacturer` | `POST /api/vending/integrations/manufacturers/[id]/stage` | c/admin/integrations/ManufacturerStageControls.tsx | `integrations.manufacturers.manage` | audit log | Partly (edit/cancel) | Admin | Complete |
| Add and edit manufacturers | `manufacturerRegistryService.setManufacturerStatus` | `POST /api/vending/integrations/manufacturers/[id]/status` | c/admin/integrations/ManufacturerStageControls.tsx | `integrations.manufacturers.manage` | audit log | Yes (inverse action) | Admin | Complete |
| Add and edit machine models | `manufacturerRegistryService.createModel` | `POST /api/vending/integrations/models` | c/admin/integrations/CreateModelForm.tsx | `integrations.models.manage` | audit log | Partly (edit/cancel) | Admin | Complete |
| Add and edit machine models | `manufacturerRegistryService.requireModel` | `PATCH /api/vending/integrations/models/[id]` | c/admin/integrations/EditModelForm.tsx | `integrations.models.manage` | audit log | Yes (edit again) | Admin | Complete |
| Certify models and run certification | `manufacturerRegistryService.certifyModel` | `POST /api/vending/integrations/models/[id]/certify` | c/admin/integrations/CertificationPanel.tsx | `integrations.certify` | audit log | No (one-way) | Admin | Complete |
| Certify models and run certification | `manufacturerRegistryService.recordCertificationCheck` | `POST /api/vending/integrations/models/[id]/checks` | c/admin/integrations/CertificationPanel.tsx | `integrations.certify` | audit log | Partly (edit/cancel) | Admin | Complete |
| Certify models and run certification | `manufacturerRegistryService.revokeCertification` | `POST /api/vending/integrations/models/[id]/revoke-certification` | c/admin/integrations/CertificationPanel.tsx | `integrations.certify` | audit log | No (one-way) | Admin | Complete |
| See manufacturers and machine integrations | `machineIntegrationService.listIntegrations` | `GET /api/vending/integrations/overview` | — | `integrations.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse | Read API (pages read the service directly) |
| See machine sales intelligence | `networkIntelligenceService.getLocationTypePerformance` | `GET /api/vending/intelligence/location-types` | — | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| See machine sales intelligence | `networkIntelligenceService.compareLocations` | `GET /api/vending/intelligence/locations/[id]` | — | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| See machine sales intelligence | `productIntelligenceService.getLocationProductPerformance` | `GET /api/vending/intelligence/locations/[id]/products` | — | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| See machine sales intelligence | `machineAssortmentIntelligenceService.classifyMachineCatalogLayers` | `GET /api/vending/intelligence/machines/[id]` | — | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| See machine sales intelligence | `networkIntelligenceService.getNetworkOverview` | `GET /api/vending/intelligence/network` | — | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| See machine sales intelligence | `peerLearningService.recommendAssortmentForNewMachine` | `POST /api/vending/intelligence/new-machine-recommendation` | (page reads peerLearningService directly: admin/vending/intelligence/plan) | `analytics.vending.view` | none | Partly (edit/cancel) | Admin; Machine operations; Warehouse; Finance | Works, unaudited |
| See machine sales intelligence | `productIntelligenceService.getNetworkProductPerformance` | `GET /api/vending/intelligence/products` | — | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| See machine sales intelligence | `peerLearningService.getProductLocationTypeAffinity` | `GET /api/vending/intelligence/products/[id]/affinity` | — | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| See machine sales intelligence | `peerLearningService.findProductOpportunities` | `GET /api/vending/intelligence/products/opportunities` | — | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| See machines, slots and machine health | `kioskScreenService.list` | `GET /api/vending/kiosk-screen/images` | c/admin/KioskScreenImagesManager.tsx | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Edit the customer screen (artwork, product text) | `kioskScreenService.list` | `POST /api/vending/kiosk-screen/images` | c/admin/KioskScreenImagesManager.tsx | `machine_screen.manage` | audit log | Partly (edit/cancel) | Admin; Machine operations; Warehouse; Marketing | Complete |
| Edit the customer screen (artwork, product text) | `kioskScreenImageRepository.findById` | `DELETE /api/vending/kiosk-screen/images/[imageId]` | c/admin/KioskScreenImagesManager.tsx | `machine_screen.manage` | audit log | No (removal) | Admin; Machine operations; Warehouse; Marketing | Complete |
| Edit the customer screen (artwork, product text) | `kioskScreenImageRepository.findById` | `PATCH /api/vending/kiosk-screen/images/[imageId]` | c/admin/KioskScreenImagesManager.tsx | `machine_screen.manage` | audit log | Yes (edit again) | Admin; Machine operations; Warehouse; Marketing | Complete |
| See locations | `locationService.listByType` | `GET /api/vending/locations` | c/admin/vending/LocationForm.tsx | `locations.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Complete |
| Create and edit locations | `locationService.listByType` | `POST /api/vending/locations` | c/admin/vending/LocationForm.tsx | `locations.manage` | audit log | Partly (edit/cancel) | Admin; Machine operations; Warehouse | Complete |
| See locations | `locationService.findById` | `GET /api/vending/locations/[id]` | c/admin/vending/LocationForm.tsx | `locations.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Complete |
| Create and edit locations | `locationService.findById` | `PATCH /api/vending/locations/[id]` | c/admin/vending/LocationForm.tsx | `locations.manage` | audit log | Yes (edit again) | Admin; Machine operations; Warehouse | Complete |
| See machines, slots and machine health | `machineIntegrationRepository.findByMachineId` | `GET /api/vending/machines/[id]` | c/admin/vending/MachineStatusControls.tsx | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Write | `machineIntegrationRepository.findByMachineId` | `PATCH /api/vending/machines/[id]` | c/admin/vending/MachineStatusControls.tsx | `machines.decommission, machines.relocate, machines.status.manage` | audit log | Yes (edit again) | Admin | Complete |
| Certify models and run certification | `machineIntegrationRepository.findByMachineId` | `POST /api/vending/machines/[id]/api-probe` | c/admin/integrations/CertificationToolsPanel.tsx | `integrations.certify` | audit log | No (one-way) | Admin | Complete |
| See machines, slots and machine health | `machineAssortmentService.listByMachine` | `GET /api/vending/machines/[id]/assortment` | c/admin/integrations/CertificationToolsPanel.tsx +3 | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Choose what each machine sells | `machineAssortmentService.listByMachine` | `POST /api/vending/machines/[id]/assortment` | c/admin/integrations/CertificationToolsPanel.tsx +3 | `machine_catalog.manage` | audit log | Partly (edit/cancel) | Admin; Machine operations; Warehouse | Complete |
| See machines, slots and machine health | `machineAssortmentService.listByMachine` | `GET /api/vending/machines/[id]/assortment/[productCatalogue]/[productId]` | c/admin/MachineScreenProducts.tsx +2 | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Write | `machineAssortmentService.listByMachine` | `PATCH /api/vending/machines/[id]/assortment/[productCatalogue]/[productId]` | c/admin/MachineScreenProducts.tsx +2 | `machine_catalog.manage, machine_screen.manage, pricing.manage` | audit log | Yes (edit again) | Admin; Machine operations; Warehouse | Complete |
| Write | `machineAssortmentService.copyRange` | `POST /api/vending/machines/[id]/assortment/copy` | c/admin/vending/MachineCatalogueEditor.tsx | `machine_catalog.manage, pricing.manage` | audit log | No (one-way) | Admin; Machine operations; Warehouse | Complete |
| See cameras and snapshots | `cameraService.listByMachine` | `GET /api/vending/machines/[id]/cameras` | c/admin/AddCameraForm.tsx +1 | `cameras.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Complete |
| Add, configure and disable cameras | `cameraService.listByMachine` | `POST /api/vending/machines/[id]/cameras` | c/admin/AddCameraForm.tsx +1 | `cameras.manage` | audit log | Partly (edit/cancel) | Admin; Machine operations | Complete |
| Read | `machineAssortmentService.getSellableCatalog` | `GET /api/vending/machines/[id]/catalog` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `device key` | n/a | n/a (read) | — | Complete |
| Certify models and run certification | `integrationCertificationService.run` | `POST /api/vending/machines/[id]/certification-runs` | c/admin/integrations/CertificationToolsPanel.tsx | `integrations.certify` | audit log | No (one-way) | Admin | Complete |
| See machines, slots and machine health | `machineCommandService.listHistoryForMachine` | `GET /api/vending/machines/[id]/commands` | c/admin/IssueMachineCommandAction.tsx +1 | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Send commands to a machine (restart, sync) | `machineCommandService.listHistoryForMachine` | `POST /api/vending/machines/[id]/commands` | c/admin/IssueMachineCommandAction.tsx +1 | `machines.commands.issue` | audit log | No (one-way) | Admin; Machine operations; Warehouse | Complete |
| Rotate or revoke a machine’s screen key | `machineService.findById` | `GET /api/vending/machines/[id]/credentials` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `machines.credentials.manage` | n/a | n/a (read) | Admin; Machine operations | Complete |
| Rotate or revoke a machine’s screen key | `machineService.findById` | `POST /api/vending/machines/[id]/credentials` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `machines.credentials.manage` | audit log | Partly (edit/cancel) | Admin; Machine operations | Complete |
| Rotate or revoke a machine’s screen key | `deviceCredentialRepository.findById` | `POST /api/vending/machines/[id]/credentials/[credentialId]/revoke` | c/admin/vending/DeviceKeysCard.tsx | `machines.credentials.manage` | audit log | No (one-way) | Admin; Machine operations | Complete |
| See manufacturers and machine integrations | `machineIntegrationService.getView` | `GET /api/vending/machines/[id]/integration` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `integrations.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse | Complete |
| Connect a machine to its manufacturer | `machineIntegrationService.getView` | `PUT /api/vending/machines/[id]/integration` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `integrations.machines.configure` | audit log | Yes (edit again) | Admin; Machine operations | Complete |
| See machines, slots and machine health | `machineEventService.listForMachine` | `GET /api/vending/machines/[id]/integration-events` | c/admin/integrations/CertificationToolsPanel.tsx | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Activate, suspend and test machine integrations | `machineIntegrationService.activate` | `POST /api/vending/machines/[id]/integration/activate` | c/admin/integrations/MachineIntegrationPanel.tsx | `integrations.machines.activate` | audit log | Yes (inverse action) | Admin; Machine operations | Complete |
| Put a machine into maintenance | `machineIntegrationRepository.setMaintenance` | `PUT /api/vending/machines/[id]/integration/maintenance` | c/admin/integrations/MachineIntegrationPanel.tsx | `integrations.machines.maintenance` | audit log | Yes (inverse action) | Admin; Machine operations; Warehouse | Complete |
| Activate, suspend and test machine integrations | `machineIntegrationService.suspend` | `POST /api/vending/machines/[id]/integration/suspend` | c/admin/integrations/MachineIntegrationPanel.tsx | `integrations.machines.activate` | audit log | Yes (inverse action) | Admin; Machine operations | Complete |
| Activate, suspend and test machine integrations | `machineIntegrationService.testConnection` | `POST /api/vending/machines/[id]/integration/test` | c/admin/integrations/MachineIntegrationPanel.tsx | `integrations.machines.activate` | audit log | No (one-way) | Admin; Machine operations | Complete |
| Add and edit machine owners and agreements | `machineService.findById` | `PATCH /api/vending/machines/[id]/owner` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `owners.manage` | audit log | Yes (inverse action) | Admin | Complete |
| See machines, slots and machine health | `machineSlotRepository.listPriceHistory` | `GET /api/vending/machines/[id]/price-history` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| See machines, slots and machine health | `machineInventoryReserveService.getReserveStatus` | `GET /api/vending/machines/[id]/reserve` | c/admin/integrations/CertificationToolsPanel.tsx | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Read | `kioskScreenService.resolveForMachine` | `GET /api/vending/machines/[id]/screen` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `device key` | n/a | n/a (read) | — | Complete |
| See owner wallets, settlements and subscriptions | `machineSettlementService.listByMachine` | `GET /api/vending/machines/[id]/settlements` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `owner_finance.view` | n/a | n/a (read) | Admin; Finance | Complete |
| Prepare owner settlements | `machineSettlementService.listByMachine` | `POST /api/vending/machines/[id]/settlements` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `owner_finance.settlements.manage` | record trail | Partly (edit/cancel) | Admin | Complete |
| Prepare owner settlements | `machineRepository.findById` | `POST /api/vending/machines/[id]/settlements/preview` | c/admin/vending/SettlementWorkbench.tsx | `owner_finance.settlements.manage` | none | Partly (edit/cancel) | Admin | Works, unaudited |
| See machines, slots and machine health | `slotMappingHistoryRepository.listForMachine` | `GET /api/vending/machines/[id]/slot-mapping` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Set up slots and slot mapping | `slotMappingHistoryRepository.listForMachine` | `PUT /api/vending/machines/[id]/slot-mapping` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `machines.slots.configure` | audit log | Yes (edit again) | Admin; Machine operations | Complete |
| See machines, slots and machine health | `machineSlotService.listByMachine` | `GET /api/vending/machines/[id]/slots` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Write | `machineSlotService.listByMachine` | `PATCH /api/vending/machines/[id]/slots` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `machines.slots.toggle, pricing.manage` | audit log | Yes (edit again) | Admin; Machine operations; Warehouse | Complete |
| Write | `machineSlotRepository.findBySlotCode` | `PUT /api/vending/machines/[id]/slots/[slotCode]` | c/admin/StockDiscrepancyForm.tsx +1 | `machines.slots.configure, pricing.manage` | audit log | Yes (edit again) | Admin; Machine operations | Complete |
| Set up slots and slot mapping | `machineSlotService.releaseQuarantine` | `POST /api/vending/machines/[id]/slots/[slotCode]/return-to-sale` | c/admin/vending/SlotEditor.tsx | `machines.slots.configure` | audit log | Partly (edit/cancel) | Admin; Machine operations | Complete |
| Correct machine stock counts | `machineInventoryMovementService.recordDiscrepancyAdjustment` | `POST /api/vending/machines/[id]/slots/adjust` | c/admin/StockDiscrepancyForm.tsx +1 | `machine_inventory.adjust` | audit log | Partly (edit/cancel) | Admin; Machine operations; Warehouse | Complete |
| Write | `machineSlotService.copyLayout` | `POST /api/vending/machines/[id]/slots/copy` | c/admin/vending/SlotEditor.tsx | `machines.slots.configure, pricing.manage` | audit log | No (one-way) | Admin; Machine operations | Complete |
| See machines, slots and machine health | `machineRepository.findById` | `GET /api/vending/machines/[id]/stock-check` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `machines.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Marketing | Complete |
| Correct machine stock counts | `machineRepository.findById` | `POST /api/vending/machines/[id]/stock-check` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `machine_inventory.adjust` | audit log | Partly (edit/cancel) | Admin; Machine operations; Warehouse | Complete |
| Download machine stock movements | `machineRepository.findById` | `GET /api/vending/machines/[id]/stock-movements/export` | admin/vending/[machineId]/slots/page.tsx | `machine_inventory.export` | n/a | n/a (read) | Admin | Complete |
| See owner wallets, settlements and subscriptions | `machineSubscriptionService.findActiveForMachine` | `GET /api/vending/machines/[id]/subscription` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `owner_finance.view` | n/a | n/a (read) | Admin; Finance | Complete |
| Manage owner subscriptions | `machineSubscriptionService.findActiveForMachine` | `POST /api/vending/machines/[id]/subscription` | c/admin/integrations/CertificationToolsPanel.tsx +1 | `owner_finance.subscriptions.manage` | audit log | Yes (inverse action) | Admin | Complete |
| Manage owner subscriptions | `machineSubscriptionRepository.findById` | `PATCH /api/vending/machines/[id]/subscription/[subscriptionId]` | c/admin/vending/SubscriptionCard.tsx | `owner_finance.subscriptions.manage` | audit log | Yes (edit again) | Admin | Complete |
| Run a test vend | `machineTransactionService.startDiagnosticVend` | `POST /api/vending/machines/[id]/testVend` | c/admin/TestVendAction.tsx +1 | `machines.test_vend` | audit log | No (one-way) | Admin; Machine operations | Complete |
| See machine owners | `partnerService.listByBusiness` | `GET /api/vending/partners` | c/admin/vending/OwnerControls.tsx | `owners.view` | n/a | n/a (read) | Admin; Machine operations; Finance | Complete |
| Add and edit machine owners and agreements | `partnerService.listByBusiness` | `POST /api/vending/partners` | c/admin/vending/OwnerControls.tsx | `owners.manage` | audit log | Partly (edit/cancel) | Admin | Complete |
| Add and edit machine owners and agreements | `partnerService.update` | `PATCH /api/vending/partners/[partnerId]` | admin/vending/partners/page.tsx +1 | `owners.manage` | audit log | Yes (edit again) | Admin | Complete |
| See machine owners | `partnerService.listAgreements` | `GET /api/vending/partners/[partnerId]/agreements` | c/admin/vending/OwnerControls.tsx | `owners.view` | n/a | n/a (read) | Admin; Machine operations; Finance | Complete |
| Add and edit machine owners and agreements | `partnerService.listAgreements` | `POST /api/vending/partners/[partnerId]/agreements` | c/admin/vending/OwnerControls.tsx | `owners.manage` | audit log | Partly (edit/cancel) | Admin | Complete |
| Add and edit machine owners and agreements | `partnerService.transitionAgreement` | `PATCH /api/vending/partners/[partnerId]/agreements/[agreementId]` | c/admin/vending/OwnerControls.tsx | `owners.manage` | audit log | Yes (edit again) | Admin | Complete |
| See owner wallets, settlements and subscriptions | `ownerIntelligenceService.getMachineOwnerSummary` | `GET /api/vending/partners/[partnerId]/machines/[machineId]/intelligence` | — | `owner_finance.view` | n/a | n/a (read) | Admin; Finance | Read API (pages read the service directly) |
| See owner wallets, settlements and subscriptions | `machineSettlementService.listByPartner` | `GET /api/vending/partners/[partnerId]/settlements` | — | `owner_finance.view` | n/a | n/a (read) | Admin; Finance | Read API (pages read the service directly) |
| See owner wallets, settlements and subscriptions | `partnerService.findById` | `GET /api/vending/partners/[partnerId]/settlements/export` | c/admin/vending/SettlementWorkbench.tsx | `owner_finance.view` | n/a | n/a (read) | Admin; Finance | Complete |
| See owner wallets, settlements and subscriptions | `machineSubscriptionService.listByPartner` | `GET /api/vending/partners/[partnerId]/subscriptions` | — | `owner_finance.view` | n/a | n/a (read) | Admin; Finance | Read API (pages read the service directly) |
| See owner wallets, settlements and subscriptions | `partnerService.findById` | `GET /api/vending/partners/[partnerId]/wallet` | — | `owner_finance.view` | n/a | n/a (read) | Admin; Finance | Read API (pages read the service directly) |
| See owner wallets, settlements and subscriptions | `withdrawalService.listWithdrawalsForOwner` | `GET /api/vending/partners/[partnerId]/withdrawals` | c/admin/RequestPartnerWithdrawalAction.tsx +1 | `owner_finance.view` | n/a | n/a (read) | Admin; Finance | Complete |
| Request payouts for owners | `withdrawalService.listWithdrawalsForOwner` | `POST /api/vending/partners/[partnerId]/withdrawals` | c/admin/RequestPartnerWithdrawalAction.tsx +1 | `owner_finance.payouts.request` | record trail | No (one-way) | Admin | Complete |
| Write | `—` | `POST /api/vending/partners/auth/logout` | c/partner/PartnerAccountMenu.tsx +1 | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |
| Write | `partnerAuthService.register` | `POST /api/vending/partners/auth/register` | c/partner/PartnerLoginForm.tsx | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |
| Write | `partnerAuthService.login` | `POST /api/vending/partners/auth/session` | c/partner/PartnerLoginForm.tsx | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |
| Download the machine owner list | `partnerRepository.listByBusiness` | `GET /api/vending/partners/export` | admin/vending/partners/page.tsx +1 | `owners.export` | n/a | n/a (read) | Admin | Complete |
| Read | `ownerPortalService.getRecentActivity` | `GET /api/vending/partners/me/activity` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `ownerPortalService.getAlerts` | `GET /api/vending/partners/me/alerts` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `ownerPortalService.getCameraDiagnosticsForOwner` | `GET /api/vending/partners/me/cameras/[cameraId]` | c/partner/PartnerCameraActions.tsx | `owner session` | n/a | n/a (read) | — | System interface |
| Write | `ownerPortalService.captureCameraSnapshotForOwner` | `POST /api/vending/partners/me/cameras/[cameraId]/snapshot` | c/partner/PartnerCameraActions.tsx | `owner session` | audit log | No (one-way) | — | System interface |
| Read | `ownerPortalService.listCameraSnapshotsForOwner` | `GET /api/vending/partners/me/cameras/[cameraId]/snapshots` | c/partner/PartnerCameraActions.tsx | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `ownerPortalService.getCameraStreamInfoForOwner` | `GET /api/vending/partners/me/cameras/[cameraId]/stream-info` | c/partner/PartnerCameraActions.tsx | `owner session` | n/a | n/a (read) | — | System interface |
| Write | `ownerPortalService.testCameraConnectionForOwner` | `POST /api/vending/partners/me/cameras/[cameraId]/test` | c/partner/PartnerCameraActions.tsx | `owner session` | audit log | No (one-way) | — | System interface |
| Read | `ownerPortalService.getDashboard` | `GET /api/vending/partners/me/dashboard` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Write | `machineRepository.listByLocation` | `PUT /api/vending/partners/me/locations/[locationId]/expenses` | c/partner/LocationExpensesForm.tsx | `owner session` | none | Yes (edit again) | — | System interface |
| Read | `ownerPortalService.getMachineDetail` | `GET /api/vending/partners/me/machines/[machineId]` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `ownerPortalService.listCamerasForMachine` | `GET /api/vending/partners/me/machines/[machineId]/cameras` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `ownerPortalService.getMachineHealth` | `GET /api/vending/partners/me/machines/[machineId]/health` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `ownerPortalService.getMachineInventory` | `GET /api/vending/partners/me/machines/[machineId]/inventory` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Write | `ownerPortalService.requestRestock` | `POST /api/vending/partners/me/machines/[machineId]/restock-request` | c/partner/RestockRequestButton.tsx | `owner session` | audit log | Partly (edit/cancel) | — | System interface |
| Read | `ownerPortalService.getSalesTrend` | `GET /api/vending/partners/me/sales-trend` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `machineSettlementService.listByPartner` | `GET /api/vending/partners/me/settlements` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `machineSubscriptionService.listByPartner` | `GET /api/vending/partners/me/subscriptions` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `ownerPortalService.getTopProducts` | `GET /api/vending/partners/me/top-products` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `partnerService.findById` | `GET /api/vending/partners/me/wallet` | — | `owner session` | n/a | n/a (read) | — | System interface |
| Read | `withdrawalService.listWithdrawalsForOwner` | `GET /api/vending/partners/me/withdrawals` | c/admin/RequestPartnerWithdrawalAction.tsx +1 | `owner session` | n/a | n/a (read) | — | System interface |
| Write | `withdrawalService.listWithdrawalsForOwner` | `POST /api/vending/partners/me/withdrawals` | c/admin/RequestPartnerWithdrawalAction.tsx +1 | `owner session` | audit log | No (one-way) | — | System interface |
| Write | `machineTransactionService.initiateCartPayment` | `POST /api/vending/payments` | c/kiosk/KioskScreen.tsx | `device key` | none | Partly (edit/cancel) | — | Works, unaudited |
| Read | `machineTransactionService.findById` | `GET /api/vending/payments/[id]` | c/kiosk/KioskScreen.tsx | `device key` | n/a | n/a (read) | — | Complete |
| See machine sales intelligence | `recommendationEngineService.listByBusiness` | `GET /api/vending/recommendations` | — | `analytics.vending.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance | Read API (pages read the service directly) |
| Generate and act on recommendations | `recommendationEngineService.approve` | `POST /api/vending/recommendations/[id]/approve` | c/admin/RecommendationActions.tsx | `recommendations.act` | none | No (one-way) | Admin; Machine operations; Warehouse | Works, unaudited |
| Generate and act on recommendations | `recommendationEngineService.dismiss` | `POST /api/vending/recommendations/[id]/dismiss` | c/admin/RecommendationActions.tsx | `recommendations.act` | none | No (one-way) | Admin; Machine operations; Warehouse | Works, unaudited |
| Generate and act on recommendations | `recommendationEngineService.recordOutcome` | `POST /api/vending/recommendations/[id]/outcome` | c/admin/RecommendationActions.tsx | `recommendations.act` | none | No (one-way) | Admin; Machine operations; Warehouse | Works, unaudited |
| Generate and act on recommendations | `scheduledJobService.run` | `POST /api/vending/recommendations/generate` | c/admin/GenerateRecommendationsButton.tsx | `recommendations.act` | audit log | No (one-way) | Admin; Machine operations; Warehouse | Complete |
| See machine sales | `vendingReconciliationService.getReconciliationIssues` | `GET /api/vending/reconciliation` | — | `sales.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Support | Read API (pages read the service directly) |
| Write | `locationService.findById` | `POST /api/vending/register` | c/admin/vending/MachineRegistrationWizard.tsx | `machines.create, machines.relocate, owners.manage` | audit log | Partly (edit/cancel) | Admin; Machine operations | Complete |
| See restock tasks | `restockTaskRepository.listOpenByMachine` | `GET /api/vending/restock` | c/admin/CreateRestockTaskButton.tsx | `restock.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse | Complete |
| Create, approve and cancel restock tasks | `restockTaskRepository.listOpenByMachine` | `POST /api/vending/restock` | c/admin/CreateRestockTaskButton.tsx | `restock.plan` | audit log | Partly (edit/cancel) | Admin; Machine operations; Warehouse | Complete |
| Create, approve and cancel restock tasks | `restockTaskRepository.findById` | `POST /api/vending/restock/[taskId]/approve` | c/admin/RestockTaskActions.tsx | `restock.plan` | audit log | No (one-way) | Admin; Machine operations; Warehouse | Complete |
| Create, approve and cancel restock tasks | `restockTaskRepository.findById` | `POST /api/vending/restock/[taskId]/cancel` | c/admin/RestockTaskActions.tsx | `restock.plan` | audit log | Yes (inverse action) | Admin; Machine operations; Warehouse | Complete |
| Pick, dispatch and receive restocks | `restockTaskRepository.findById` | `POST /api/vending/restock/[taskId]/dispatch` | c/admin/RestockTaskActions.tsx | `restock.execute` | audit log | No (one-way) | Admin; Machine operations; Warehouse | Complete |
| Pick, dispatch and receive restocks | `restockTaskRepository.findById` | `POST /api/vending/restock/[taskId]/mark-in-transit` | c/admin/RestockTaskActions.tsx | `restock.execute` | audit log | No (one-way) | Admin; Machine operations; Warehouse | Complete |
| Pick, dispatch and receive restocks | `restockTaskRepository.findById` | `POST /api/vending/restock/[taskId]/receive` | c/admin/RestockTaskActions.tsx | `restock.execute` | audit log | No (one-way) | Admin; Machine operations; Warehouse | Complete |
| Pick, dispatch and receive restocks | `restockTaskRepository.findById` | `POST /api/vending/restock/[taskId]/start-picking` | c/admin/RestockTaskActions.tsx | `restock.execute` | audit log | No (one-way) | Admin; Machine operations; Warehouse | Complete |
| Run scheduled jobs now and rebuild analytics | `scheduledJobService.run` | `POST /api/vending/rollups/rebuild` | c/admin/JobControls.tsx | `ops.jobs.run` | audit log | No (one-way) | Admin | Complete |
| Write | `vendingSaleReviewService.getSale` | `POST /api/vending/sales/[id]/resolve` | c/admin/SaleReviewActions.tsx | `sales.refund, sales.review.resolve` | audit log | No (one-way) | Admin; Finance | Complete |
| Download machine sales | `vendingSalesService.exportCsv` | `GET /api/vending/sales/export` | admin/vending/sales/page.tsx +1 | `sales.export` | n/a | n/a (read) | Admin; Finance | Complete |
| Prepare owner settlements | `machineSettlementService.findById` | `DELETE /api/vending/settlements/[id]` | c/admin/vending/SettlementWorkbench.tsx | `owner_finance.settlements.manage` | audit log | No (removal) | Admin | Complete |
| Prepare owner settlements | `machineSettlementService.findById` | `PATCH /api/vending/settlements/[id]` | c/admin/vending/SettlementWorkbench.tsx | `owner_finance.settlements.manage` | audit log | Yes (edit again) | Admin | Complete |
| Finalize settlements (credits the owner) | `machineSettlementService.findById` | `POST /api/vending/settlements/[id]/finalize` | c/admin/vending/SettlementWorkbench.tsx | `owner_finance.settlements.finalize` | audit log | No (one-way) | Admin | Complete |
| Write | `machineTelemetryService.ingest` | `POST /api/vending/telemetry` | lib/vending/adapters/snackQuestGatewayAdapter.ts | `device key` | none | Partly (edit/cancel) | — | Works, unaudited |
| See machine sales | `saleTraceService.trace` | `GET /api/vending/trace` | — | `sales.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Support | Read API (pages read the service directly) |
| See machine sales | `machineTransactionService.applyVendResult` | `GET /api/vending/transactions` | lib/auth/requireStaffRole.ts +1 | `sales.view` | n/a | n/a (read) | Admin; Machine operations; Warehouse; Finance; Support | Complete |
| Write | `machineTransactionService.applyVendResult` | `POST /api/vending/transactions` | lib/auth/requireStaffRole.ts +1 | `public/other` | none | Partly (edit/cancel) | — | Works, unaudited |

## Warehouse workspace — `/api/warehouse`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Record an order’s fulfilment costs | `orderRepository.findById` | `POST /api/warehouse/orders/[orderId]/costs` | c/warehouse/RecordCostsForm.tsx | `orders.costs.record` | none | Partly (edit/cancel) | Admin; Warehouse | Works, unaudited |
| Pack orders and run shopping trips | `orderRepository.findById` | `POST /api/warehouse/orders/[orderId]/curated-snacks` | c/warehouse/CompleteBoxForm.tsx | `warehouse_fulfilment.manage` | none | Partly (edit/cancel) | Admin; Warehouse | Works, unaudited |
| Pack orders and run shopping trips | `shoppingRunService.createRun` | `POST /api/warehouse/shopping-runs` | c/warehouse/NewShoppingRun.tsx | `warehouse_fulfilment.manage` | audit log | Partly (edit/cancel) | Admin; Warehouse | Complete |
| Pack orders and run shopping trips | `shoppingRunService.reopenRun` | `POST /api/warehouse/shopping-runs/[runId]/complete` | c/warehouse/CompleteShoppingRun.tsx | `warehouse_fulfilment.manage` | audit log | No (one-way) | Admin; Warehouse | Complete |
| Pack orders and run shopping trips | `shoppingRunService.recordLine` | `PATCH /api/warehouse/shopping-runs/[runId]/lines` | c/warehouse/ShoppingRunList.tsx | `warehouse_fulfilment.manage` | none | Yes (edit again) | Admin; Warehouse | Works, unaudited |

## Webhooks — `/api/webhooks`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `paymentService.processCallback` | `POST /api/webhooks/daraja/[businessId]` | app/api-docs/page.tsx | `shared secret` | none | Partly (edit/cancel) | — | System interface |
| Write | `—` | `POST /api/webhooks/daraja/[businessId]/b2c-result` | app/api-docs/page.tsx | `shared secret` | none | Partly (edit/cancel) | — | System interface |
| Write | `—` | `POST /api/webhooks/daraja/[businessId]/b2c-timeout` | app/api-docs/page.tsx | `shared secret / signature` | none | Partly (edit/cancel) | — | System interface |
| Write | `RefundService.handleReversalResult` | `POST /api/webhooks/daraja/[businessId]/reversal-result` | app/api-docs/page.tsx | `shared secret / signature` | none | Partly (edit/cancel) | — | System interface |
| Write | `refundService.handleReversalResult` | `POST /api/webhooks/daraja/[businessId]/reversal-timeout` | app/api-docs/page.tsx | `shared secret / signature` | record trail | Partly (edit/cancel) | — | System interface |
| Write | `WithdrawalService.handleTransactionStatusResult` | `POST /api/webhooks/daraja/[businessId]/transaction-status-result` | — | `shared secret / signature` | none | Partly (edit/cancel) | — | System interface |
| Write | `withdrawalService.handleTransactionStatusResult` | `POST /api/webhooks/daraja/[businessId]/transaction-status-timeout` | — | `shared secret / signature` | record trail | Partly (edit/cancel) | — | System interface |
| Read | `webhookEventRepository.recordIfNew` | `GET /api/webhooks/textsms/dlr` | — | `shared secret / signature` | n/a | n/a (read) | — | System interface |
| Write | `webhookEventRepository.recordIfNew` | `POST /api/webhooks/textsms/dlr` | — | `shared secret / signature` | none | Partly (edit/cancel) | — | System interface |
| Read | `businessRepository.findByWhatsappPhoneNumberId` | `GET /api/webhooks/whatchimp` | app/api-docs/page.tsx | `shared secret` | n/a | n/a (read) | — | System interface |
| Write | `businessRepository.findByWhatsappPhoneNumberId` | `POST /api/webhooks/whatchimp` | app/api-docs/page.tsx | `shared secret` | none | Partly (edit/cancel) | — | System interface |
| Read | `webhookInspectionRepository.listRecent` | `GET /api/webhooks/whatchimp/inspect` | — | `shared secret` | n/a | n/a (read) | — | System interface |
| Write | `webhookInspectionRepository.listRecent` | `POST /api/webhooks/whatchimp/inspect` | — | `shared secret` | none | Partly (edit/cancel) | — | System interface |

## Whatchimp — `/api/whatchimp`

| Capability | Backend | API | UI | Permission | Audit | Reversible | Role(s) | Status |
|---|---|---|---|---|---|---|---|---|
| Write | `conversationRepository.findById` | `POST /api/whatchimp/apply-referral` | — | `bridge key` | none | Partly (edit/cancel) | — | System interface |
| Write | `conversationRepository.findById` | `POST /api/whatchimp/checkout` | — | `bridge key` | none | Partly (edit/cancel) | — | System interface |
| Read | `conversationRepository.findById` | `GET /api/whatchimp/order-status` | — | `bridge key` | n/a | n/a (read) | — | System interface |
| Write | `conversationRepository.findById` | `POST /api/whatchimp/quote-delivery` | — | `bridge key` | none | Partly (edit/cancel) | — | System interface |
| Write | `businessRepository.findByWhatsappPhoneNumberId` | `POST /api/whatchimp/select-product` | — | `bridge key` | none | Partly (edit/cancel) | — | System interface |
| Write | `businessRepository.findByWhatsappPhoneNumberId` | `POST /api/whatchimp/turn` | — | `bridge key` | none | Partly (edit/cancel) | — | System interface |

## Pages and their gates

Server pages read services directly, so these are capabilities in their own right. The gate is the layout's or the page's own.

| Page | Gate |
|---|---|
| `/admin/analytics` | workspace role |
| `/admin/audit-logs` | `audit.view` (section operations) · in page: `audit.export` |
| `/admin/campaigns/[campaignId]` | `marketing.campaigns.manage` (section marketing) |
| `/admin/campaigns/new` | `marketing.campaigns.manage` (section marketing) |
| `/admin/campaigns` | `marketing.campaigns.manage` (section marketing) |
| `/admin/conversations/[conversationId]` | `support.conversations.handle` (section conversations) |
| `/admin/conversations` | `support.conversations.handle` (section conversations) |
| `/admin/creators/[uid]` | `creators.manage` (section marketing) |
| `/admin/creators` | `creators.manage` (section marketing) |
| `/admin/customers/[phoneNumber]` | `customers.view` (section marketing) |
| `/admin/customers` | `customers.view` (section marketing) |
| `/admin/deliveries/[shipmentId]` | `orders.view` (section orders) |
| `/admin/deliveries` | `orders.view` (section orders) |
| `/admin/delivery-zones` | `logistics.view` (section orders) |
| `/admin/discount-codes` | `marketing.discounts.manage` (section marketing) |
| `/admin/faqs` | `content.manage` (section marketing) |
| `/admin/fulfillment-batches/[batchId]` | `logistics.manage` (section orders) |
| `/admin/fulfillment-batches/new` | `logistics.manage` (section orders) |
| `/admin/fulfillment-batches` | `logistics.manage` (section orders) |
| `/admin/fulfilment-costs` | `orders.costs.bulk` (section orders) |
| `/admin/inventory/batches` | `products.view` (section orders) |
| `/admin/inventory` | `products.view` (section orders) |
| `/admin/marketing-emails/[id]` | `marketing.messages.manage` (section marketing) · in page: `marketing.messages.manage` |
| `/admin/marketing-emails/new` | `marketing.messages.manage` (section marketing) · in page: `marketing.messages.manage` |
| `/admin/marketing-emails` | `marketing.messages.manage` (section marketing) · in page: `marketing.messages.manage` |
| `/admin/marketing-sms/[id]` | `marketing.messages.manage` (section marketing) · in page: `marketing.messages.manage` |
| `/admin/marketing-sms/new` | `marketing.messages.manage` (section marketing) · in page: `marketing.messages.manage` |
| `/admin/marketing-sms` | `marketing.messages.manage` (section marketing) · in page: `marketing.messages.manage` |
| `/admin/notification-templates/[code]` | `settings.notifications.manage` (section marketing) · in page: `settings.notifications.manage` |
| `/admin/notification-templates` | `settings.notifications.manage` (section marketing) · in page: `settings.notifications.manage` |
| `/admin/operations` | `settings.view` (section operations) · in page: `ops.jobs.run` |
| `/admin/orders/[orderId]` | `orders.view` (section orders) · in page: `orders.contents.edit`, `payments.record_manual` |
| `/admin/orders` | `orders.view` (section orders) · in page: `payments.record_manual` |
| `/admin` | workspace role · in page: `finance.view`, `users.manage` |
| `/admin/products/[packageId]` | `products.view` (section orders) |
| `/admin/products/new` | `products.view` (section orders) |
| `/admin/products` | `products.view` (section orders) |
| `/admin/purchase-orders/[purchaseOrderId]` | `procurement.manage` (section orders) |
| `/admin/purchase-orders/new` | `procurement.manage` (section orders) |
| `/admin/purchase-orders` | `procurement.manage` (section orders) |
| `/admin/recipes/[packageId]` | `products.view` (section orders) |
| `/admin/recipes` | `products.view` (section orders) |
| `/admin/reconciliation` | `finance.view` (section finance) |
| `/admin/referrals` | `marketing.campaigns.manage` (section marketing) |
| `/admin/reviews` | `content.manage` (section marketing) |
| `/admin/settings/feature-flags` | `settings.view` (section operations) |
| `/admin/settings/homepage` | `settings.view` (section operations) |
| `/admin/settings/integrations` | `settings.view` (section operations) · in page: `settings.integrations.manage` |
| `/admin/settings` | `settings.view` (section operations) |
| `/admin/sms-opt-outs` | `marketing.optouts.manage` (section marketing) · in page: `marketing.optouts.remove` |
| `/admin/snack-items` | `products.view` (section orders) |
| `/admin/staff/[uid]` | staff session |
| `/admin/staff` | staff session · in page: `users.manage` |
| `/admin/storage` | `settings.view` (section operations) |
| `/admin/suppliers` | `procurement.manage` (section orders) |
| `/admin/vending/[machineId]/catalog-preview` | `machines.view` (section vending) |
| `/admin/vending/[machineId]/catalogue` | `machines.view` (section vending) · in page: `machine_catalog.manage`, `pricing.manage` |
| `/admin/vending/[machineId]` | `machines.view` (section vending) |
| `/admin/vending/[machineId]/screen` | `machines.view` (section vending) |
| `/admin/vending/[machineId]/setup` | `machines.view` (section vending) · in page: `audit.view`, `machines.credentials.manage`, `machines.decommission`, `machines.relocate`, `machines.status.manage` |
| `/admin/vending/[machineId]/slots` | `machines.view` (section vending) · in page: `machine_inventory.adjust`, `machine_inventory.export`, `machines.slots.configure`, `machines.slots.toggle`, `pricing.manage` |
| `/admin/vending/alerts` | `alerts.view` (section vending) |
| `/admin/vending/integrations/[manufacturerId]` | `integrations.view` (section vending) · in page: `audit.view`, `integrations.credentials.manage`, `integrations.manufacturers.manage`, `integrations.models.manage` |
| `/admin/vending/integrations/credentials` | `integrations.view` (section vending) |
| `/admin/vending/integrations` | `integrations.view` (section vending) · in page: `integrations.credentials.manage` |
| `/admin/vending/intelligence/compare` | `analytics.vending.view` (section vending) |
| `/admin/vending/intelligence/location-types` | `analytics.vending.view` (section vending) |
| `/admin/vending/intelligence/locations/[locationId]` | `analytics.vending.view` (section vending) |
| `/admin/vending/intelligence/locations` | `analytics.vending.view` (section vending) |
| `/admin/vending/intelligence` | `analytics.vending.view` (section vending) |
| `/admin/vending/intelligence/plan` | `analytics.vending.view` (section vending) · in page: `machine_catalog.manage` |
| `/admin/vending/intelligence/products/[productId]` | `analytics.vending.view` (section vending) |
| `/admin/vending/intelligence/products` | `analytics.vending.view` (section vending) |
| `/admin/vending/intelligence/recommendations` | `analytics.vending.view` (section vending) |
| `/admin/vending/kiosk-screen` | `machine_screen.manage` (section vending) |
| `/admin/vending/locations/[locationId]` | `locations.view` (section vending) · in page: `analytics.vending.view`, `locations.manage` |
| `/admin/vending/locations/new` | `locations.view` (section vending) · in page: `locations.manage` |
| `/admin/vending/locations` | `locations.view` (section vending) · in page: `locations.manage` |
| `/admin/vending/new` | section `vending` · in page: `machines.relocate`, `owners.manage` |
| `/admin/vending` | section `vending` · in page: `machines.create` |
| `/admin/vending/partners/[partnerId]` | `owners.view` (section vending) · in page: `analytics.vending.view`, `audit.view`, `owner_finance.payouts.request`, `owner_finance.view`, `owners.manage` |
| `/admin/vending/partners/[partnerId]/settlements` | `owners.view` (section vending) · in page: `owner_finance.settlements.finalize`, `owner_finance.settlements.manage` |
| `/admin/vending/partners/new` | `owners.view` (section vending) |
| `/admin/vending/partners` | `owners.view` (section vending) · in page: `owner_finance.view`, `owners.export`, `owners.manage` |
| `/admin/vending/products/[productCatalogue]/[productId]` | section `vending` · in page: `machine_catalog.manage` |
| `/admin/vending/products` | section `vending` |
| `/admin/vending/reconciliation` | `sales.view` (section vending) · in page: `alerts.resolve`, `ops.jobs.run` |
| `/admin/vending/restock` | `restock.view` (section vending) |
| `/admin/vending/sales/[transactionId]` | `sales.view` (section vending) |
| `/admin/vending/sales` | `sales.view` (section vending) |
| `/admin/vending/sales/review` | `sales.view` (section vending) |
| `/admin/vending/settlements` | section `vending` |
| `/admin/vending/trace` | `sales.view` (section vending) |
| `/admin/withdrawals/[withdrawalId]` | `finance.view` (section finance) |
| `/admin/withdrawals` | `finance.view` (section finance) |
| `/admin/accept-invite` | — |
| `/admin/login` | — |
| `/agent/conversations/[conversationId]` | workspace role |
| `/agent/machine-sales/[transactionId]` | workspace role · in page: `sales.view` |
| `/agent/machine-sales` | workspace role · in page: `sales.view` |
| `/agent` | workspace role |
| `/finance/commissions` | workspace role |
| `/finance/fulfillment` | workspace role |
| `/finance/machine-sales/[transactionId]` | workspace role · in page: `sales.view` |
| `/finance/machine-sales` | workspace role · in page: `sales.export`, `sales.view` |
| `/finance` | workspace role |
| `/finance/reconciliation` | workspace role |
| `/finance/refunds` | workspace role |
| `/finance/revenue` | workspace role |
| `/partner/cameras` | owner session |
| `/partner/inventory` | owner session |
| `/partner/locations` | owner session |
| `/partner/machines/[machineId]/camera` | owner session |
| `/partner/machines/[machineId]` | owner session |
| `/partner/machines` | owner session |
| `/partner` | owner session |
| `/partner/payouts` | owner session |
| `/partner/products` | owner session |
| `/partner/reports` | owner session |
| `/partner/sales` | owner session |
| `/partner/settings` | owner session |
| `/partner/subscription` | owner session |
| `/partner/login` | — |
| `/warehouse/inventory` | workspace role |
| `/warehouse/machines` | workspace role · in page: `restock.plan`, `restock.view` |
| `/warehouse` | workspace role |
| `/warehouse/recipes/[packageId]` | workspace role |
| `/warehouse/recipes` | workspace role |
| `/warehouse/shopping/[runId]` | workspace role |
| `/warehouse/shopping` | workspace role |
