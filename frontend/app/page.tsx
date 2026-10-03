"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { getCurrentToken, logout } from "@/lib/api/auth";
import { listOrders, Order } from "@/lib/api/orders";
import { Button } from "@/components/ui/button";
import { statusClass } from "@/lib/status";
import Link from "next/link";

interface OrdersResponse {
  count: number;
  orders: Order[];
}

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    setError(null);
    setColdStart(false);

    void (async () => {
      try {
        const response = await listOrders();
        setData(response);
      } catch (err) {
        if (err instanceof ApiError) {
          // The gateway returns 403 (not 401) for invalid or expired tokens.
          // 401 is returned only when the Authorization header is missing entirely.
          if (err.status === 401 || err.status === 403) {
            logout();
            router.replace("/login");
            return;
          }
          setError("Failed to load orders. Please try again.");
        } else {
          setError("An unexpected error occurred.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    const token = getCurrentToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    void fetchOrders(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchOrders, router]);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setColdStart(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const header = (
    <div className="mb-6 flex justify-end">
      <Button variant="outline" onClick={handleLogout}>
        Log out
      </Button>
    </div>
  );

  if (loading) {
    return (
      <main className="p-6">
        {header}
        <p className="text-gray-600">
          {coldStart
            ? "Waking up the backend — this can take up to 30 seconds on the free tier."
            : "Loading orders…"}
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6">
        {header}
        <p className="text-red-600">{error}</p>
        <Button onClick={fetchOrders} variant="outline" className="mt-4">
          Retry
        </Button>
      </main>
    );
  }

  if (!data || data.orders.length === 0) {
    return (
      <main className="p-6">
        {header}
        <p className="text-gray-600">No orders yet.</p>
      </main>
    );
  }

  return (
    <main className="p-6">
      {header}

      <h1 className="mb-4 text-2xl font-bold">Orders</h1>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Order ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Saga Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created At
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.orders.map((order: Order) => (
              <tr key={order.orderId}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <Link
                    href={`/orders/${order.orderId}`}
                    className="text-blue-600 hover:underline"
                  >
                    {order.orderId}
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {order.productId}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {order.quantity}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(order.status)}`}
                  >
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(order.sagaStatus)}`}
                  >
                    {order.sagaStatus}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {order.createdAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
