"use client";

import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/site/states";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20">
      <StatePanel kind="error" title="Something went wrong">
        <p>{error.message || "An unexpected error occurred while rendering this page."}</p>
        <Button variant="outline" className="mt-4" onClick={reset}>
          Try again
        </Button>
      </StatePanel>
    </div>
  );
}
