Beta operators follow a different review model than Acme. For Beta, any order above 10 units should be reviewed by the operations lead before final confirmation, especially when the order is tied to an inventory reservation that has not yet been committed. This threshold is lower than the Acme review threshold because Beta routing emphasizes early human review for medium-sized orders that might otherwise create a backlog in the inventory or payment steps.

The review workflow should check whether the order is still `PENDING`, whether the saga is progressing normally, and whether the reservation will be released cleanly if the downstream payment or inventory stage fails. If a business-day queue shows multiple medium-sized orders stuck in `AWAITING_INVENTORY`, the operator should escalate for a manual redispatch of the order path.

This is a tenant-specific demo operational policy designed for comparison with Acme and not a claim of internal enforcement by StockSync.
