import { apiFetch } from "./client";

export interface Product {
  id: number;
  sku: string;
  name: string;
  stock_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
}

export interface ListInventoryResponse {
  products: Product[];
}

export interface GetProductResponse {
  source: string;
  product: Product;
}

export async function listInventory(): Promise<ListInventoryResponse> {
  return apiFetch<ListInventoryResponse>("/inventory");
}

export async function getProduct(sku: string): Promise<GetProductResponse> {
  return apiFetch<GetProductResponse>(`/inventory/${sku}`);
}
