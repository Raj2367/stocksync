StockSync order processing follows a simple lifecycle that is visible in both the order record and the owning saga. An order starts in the `PENDING` state while the saga is still progressing through its workflow. During this stage, the system is waiting on downstream operations such as inventory reservation or payment approval.

The saga itself carries the operational state. It can move through `AWAITING_INVENTORY` and then `AWAITING_PAYMENT` as each step completes. When all required work succeeds, the order becomes `CONFIRMED` and the saga reaches `COMPLETED`.

If the workflow fails at any point, the result is a cancellation path. In that case, the order is marked `CANCELLED` and the saga also ends in `CANCELLED`. In practical terms, this includes inventory compensation, where reserved stock is released so the system does not keep an allocation after an aborted workflow.

This means the order and saga states are closely related: the order reflects the final customer-facing outcome, while the saga records the operational progress and compensation steps required to reach that outcome.
