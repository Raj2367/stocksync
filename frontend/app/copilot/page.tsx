"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { getCurrentToken, logout } from "@/lib/api/auth";
import { askCopilot, CopilotResponse } from "@/lib/api/copilot";
import { Button } from "@/components/ui/button";

export default function CopilotPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-600">Loading…</p>}>
      <CopilotContent />
    </Suspense>
  );
}

function CopilotContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? undefined;

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<CopilotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coldStart, setColdStart] = useState(false);

  useEffect(() => {
    const token = getCurrentToken();
    if (!token) {
      router.replace("/login");
      return;
    }
  }, [router]);

  const handleSubmit = useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      if (event) {
        event.preventDefault();
      }
      const trimmed = question.trim();
      if (!trimmed) {
        return;
      }

      setLoading(true);
      setError(null);

      void (async () => {
        try {
          const response = await askCopilot(trimmed, orderId ?? undefined);
          setAnswer(response);
        } catch (err) {
          if (err instanceof ApiError) {
            if (err.status === 401 || err.status === 403) {
              logout();
              router.replace("/login");
              return;
            }
            if (err.status === 429) {
              setError("Rate limit exceeded. Try again shortly.");
              return;
            }
          }
          setError("Failed to ask the Copilot. Please try again.");
        } finally {
          setLoading(false);
        }
      })();
    },
    [orderId, router, question],
  );

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
    <div className="mb-6 flex items-center justify-between">
      <Link href="/" className="text-blue-600 hover:underline">
        Back to orders
      </Link>
      <Button variant="outline" onClick={handleLogout}>
        Log out
      </Button>
    </div>
  );

  return (
    <main className="p-6">
      {header}

      <h1 className="mb-4 text-2xl font-bold">Order Operations Copilot</h1>

      {orderId && (
        <p className="mb-4 text-sm text-gray-600">
          Asking about order:{" "}
          <Link
            href={`/orders/${orderId}`}
            className="text-blue-600 hover:underline"
          >
            {orderId}
          </Link>
        </p>
      )}

      <form onSubmit={handleSubmit} className="mb-6">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about your orders..."
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Button type="submit" disabled={loading} className="mt-3 w-full">
          {loading ? "Asking Copilot…" : "Ask Copilot"}
        </Button>
      </form>

      {loading && (
        <p className="text-gray-600">
          {coldStart
            ? "The backend may be waking up — this can take up to 30 seconds."
            : "Asking the Copilot…"}
        </p>
      )}

      {error && !loading && (
        <div className="mt-4 text-red-600">
          {error}
          {error === "Failed to ask the Copilot. Please try again." && (
            <Button
              onClick={() => handleSubmit()}
              variant="outline"
              className="ml-4"
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {answer && !loading && (
        <div className="mt-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Answer</h2>
            <p className="mt-2 text-gray-900">{answer.answer}</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Live facts used</h2>
            <div className="mt-2 flex gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  answer.liveFactsUsed.order
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                Order facts
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  answer.liveFactsUsed.saga
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                Saga facts
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Sources</h2>
            {answer.sources.length === 0 ? (
              <p className="mt-2 text-gray-600">No sources retrieved.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {answer.sources.map((source) => (
                  <li
                    key={`${source.source}-${source.chunkIndex}`}
                    className="text-sm text-gray-700"
                  >
                    {source.source} · chunk {source.chunkIndex} · score{" "}
                    {source.score.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
