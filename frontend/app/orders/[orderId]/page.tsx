"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { getCurrentToken, logout } from "@/lib/api/auth";
import { getOrder, Order } from "@/lib/api/orders";
import { statusClass } from "@/lib/status";
import { Button } from "@/components/ui/button";

export default function OrderDetailPage() {
  const router = useRouter();
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDetail = useCallback((showInitialLoading: boolean = true) => {
    if (!orderId) {
      return;
    }
    if (showInitialLoading) {
      setLoading(true);
    }
    setError(null);
    setColdStart(false);

    void (async () => {
      try {
        const response = await getOrder(orderId);
        setOrder(response);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401 || err.status === 403) {
            logout();
            router.replace("/login");
            return;
          }
          if (err.status === 404) {
            setError("Order not found.");
            return;
          }
          setError("Failed to load order. Please try again.");
        } else {
          setError("Failed to load order. Please try again.");
        }
      } finally {
        if (showInitialLoading) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    })();
  }, [orderId, router]);

  useEffect(() => {
    const token = getCurrentToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    void fetchDetail(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchDetail, router]);

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

  const handleCopilotClick = () => {
    router.push(`/copilot?orderId=${orderId}`);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchDetail(false);
  };

  if (loading) {
    return (
      <main className="p-6">
        <p className="text-gray-600">
          {coldStart
            ? "Waking up the backend — this can take up to 30 seconds on the free tier."
            : "Loading order…"}
        </p>
      </main>
    );
  }

  if (error === "Order not found.") {
    return (
      <main className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to orders
          </Link>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
        <p className="text-gray-600">Order not found.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to orders
          </Link>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
        <p className="text-red-600">{error}</p>
        <Button onClick={() => fetchDetail(true)} variant="outline" className="mt-4">
          Retry
        </Button>
      </main>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-blue-600 hover:underline">
          ← Back to orders
        </Link>
        <Button variant="outline" onClick={handleLogout}>
          Log out
        </Button>
      </div>

      <h1 className="mb-4 text-2xl font-bold">{order.orderId}</h1>

      <div className="mb-6 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="mb-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Product ID
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {order.productId}
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Quantity
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {order.quantity}
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Customer Email
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {order.customerEmail ?? "—"}
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Status
              </td>
              <td className="px-6 py-4">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(order.status)}`}
                >
                  {order.status}
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Saga Status
              </td>
              <td className="px-6 py-4">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(order.sagaStatus)}`}
                >
                  {order.sagaStatus}
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Payment Mode
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {order.paymentMode}
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Payment ID
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {order.paymentId ?? "—"}
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Failure Reason
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {order.failureReason ?? "—"}
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Created At
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {order.createdAt}
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                Updated At
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {order.updatedAt}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Button onClick={handleCopilotClick}>
        Ask Copilot about this order
      </Button>
    </main>
  );
}
