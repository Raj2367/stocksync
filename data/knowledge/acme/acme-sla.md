Acme uses a strict operational SLA for payment follow-up: support should review any order that remains in the payment wait state for more than 30 minutes during the business day. If the saga is still in `AWAITING_PAYMENT`, the case should be checked for payment-provider delays, repeated retry conditions, or a failed payment event that has not yet triggered the cancellation path.

The objective is to keep payment-backed orders from sitting in an unclear state for too long. Operators should confirm whether the order is still `PENDING`, whether the saga is still active, and whether an escalation is needed if the payment event has not reached a terminal result within the expected window.

This policy is deliberately defined as demo knowledge for Acme-specific support operations and is not a claim that the StockSync platform enforces it automatically.
