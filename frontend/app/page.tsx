"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { getCurrentToken, logout } from "@/lib/api/auth";
import { createOrder, listOrders, Order } from "@/lib/api/orders";
import { listInventory, Product } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { statusClass } from "@/lib/status";
import Link from "next/link";

interface OrdersResponse {
  count: number;
  orders: Order[];
}

type PaymentScenario = "SUCCESS" | "FAIL";

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [coldStart, setColdStart] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [paymentScenario, setPaymentScenario] =
    useState<PaymentScenario>("SUCCESS");
  const [submitting, setSubmitting] = useState(false);

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

  const fetchInventory = useCallback(() => {
    setProductsLoading(true);
    setProductsError(null);

    void (async () => {
      try {
        const response = await listInventory();
        setProducts(response.products);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401 || err.status === 403) {
            logout();
            router.replace("/login");
            return;
          }
          setProductsError("Failed to load inventory. Please try again.");
        } else {
          setProductsError("An unexpected error occurred.");
        }
      } finally {
        setProductsLoading(false);
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
    void fetchInventory();
  }, [fetchOrders, fetchInventory, router]);

  useEffect(() => {
    if (!loading && !productsLoading) return;
    const timer = setTimeout(() => {
      setColdStart(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [loading, productsLoading]);

  const handleProductChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setSelectedProduct(e.target.value);
    setQuantity(1);
  };

  const selectedProductData = products.find((p) => p.sku === selectedProduct);
  const maxQuantity = selectedProductData?.available_quantity ?? 0;
  const canSubmit = selectedProduct && quantity >= 1 && maxQuantity > 0 && !submitting;

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedProductData) return;

    setSubmitting(true);
    try {
      const response = await createOrder({
        productId: selectedProduct,
        quantity,
        paymentMode: paymentScenario,
      });
      router.push(`/orders/${response.order.orderId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) {
          logout();
          router.replace("/login");
          return;
        }
        alert("Failed to create order. Please try again.");
      } else {
        alert("An unexpected error occurred.");
      }
    } finally {
      setSubmitting(false);
    }
  };

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

  if (loading || productsLoading) {
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

  return (
    <main className="p-6">
      {header}

      <h1 className="mb-4 text-2xl font-bold">Orders</h1>

      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4 text-lg font-semibold">Demo Order</h2>

        {productsError ? (
          <p className="text-sm text-red-600">{productsError}</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-gray-600">No inventory available.</p>
        ) : (
          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div>
              <label
                htmlFor="product"
                className="block text-sm font-medium text-gray-700"
              >
                Product
              </label>
              <select
                id="product"
                value={selectedProduct}
                onChange={handleProductChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="">Select a product</option>
                {products.map((product: Product) => (
                  <option key={product.sku} value={product.sku}>
                    {product.sku} — {product.name}
                  </option>
                ))}
              </select>
              {selectedProductData && (
                <p className="mt-1 text-xs text-gray-500">
                  Available: {selectedProductData.available_quantity}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="quantity"
                className="block text-sm font-medium text-gray-700"
              >
                Quantity
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                max={maxQuantity}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
                disabled={!selectedProductData || maxQuantity === 0}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Payment scenario
              </label>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="paymentScenario"
                    value="SUCCESS"
                    checked={paymentScenario === "SUCCESS"}
                    onChange={() => setPaymentScenario("SUCCESS")}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Successful payment
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="paymentScenario"
                    value="FAIL"
                    checked={paymentScenario === "FAIL"}
                    onChange={() => setPaymentScenario("FAIL")}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Payment failure
                  </span>
                </label>
              </div>
            </div>

            <div>
              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full"
              >
                {submitting ? "Creating order…" : "Create Demo Order"}
              </Button>
            </div>
          </form>
        )}
      </section>

      {error && (
        <div className="mb-4 text-sm text-red-600">{error}</div>
      )}

      {!data || data.orders.length === 0 ? (
        <p className="text-gray-600">No orders yet.</p>
      ) : (
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
      )}
    </main>
  );
}
