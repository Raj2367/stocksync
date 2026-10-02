StockSync inventory tracks both on-hand and reserved stock so the platform can safely process orders under a saga flow. The core values are `stock_quantity`, `reserved_quantity`, and `available_quantity`. The effective availability is calculated as `available_quantity = stock_quantity - reserved_quantity`.

This formula is important because reserved inventory represents stock that has been allocated to an in-flight order but not yet committed. While a saga is still active, the reserved quantity reduces what is currently available for new demand. When the workflow is canceled or compensated, the reservation is released so the reserved count drops and the inventory returns to a reusable state.

The system also uses the `inventory_reservations` table to track reservation lifecycle. Reservation rows can move through states such as `reserved`, `released`, and `committed`. In conceptual terms, `reserved` means a claim is active, `released` means compensation has undone the claim, and `committed` means the reservation has been accepted as part of the final order outcome.

This is a basic operational model for ensuring that orders do not overdraw available stock and that cancelled transactions can cleanly unwind their allocations.
