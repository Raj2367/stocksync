Beta's support team uses a shorter customer-facing response window for stalled payment processing. Any payment-related order still in `AWAITING_PAYMENT` after 15 minutes should be triaged by the on-duty operator and assessed for retry, failure handling, or a necessary escalation to the finance queue. This is a tighter action window than the Acme model and reflects a different control policy for the demo tenant.

The objective is to keep the Beta order flow moving promptly during high-volume handling windows. If the payment step has not advanced to `COMPLETED` or the order has not reached the cancellation path, operators should verify that the order remains `PENDING` and that the saga state has not gotten stuck in a non-terminal step without human visibility.

This is tenant-facing operational policy knowledge created for the Beta demo corpus and not a claim that StockSync enforces it as a native rule.
