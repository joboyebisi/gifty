import { Suspense } from "react";
import ComposePageClient from "./compose-client";

// Force dynamic rendering - this works in server components
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Server component wrapper with Suspense
export default function ComposePage() {
  return (
    <Suspense fallback={
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    }>
      <ComposePageClient />
    </Suspense>
  );
}
