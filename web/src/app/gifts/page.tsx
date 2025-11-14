import { Suspense } from "react";
import GiftsPageClient from "./gifts-client";

// Force dynamic rendering - this works in server components
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Server component wrapper with Suspense
export default function GiftsPage() {
  return (
    <Suspense fallback={
      <div className="tg-viewport max-w-md mx-auto px-4 py-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-6"></div>
          <div className="h-48 bg-gray-200 rounded mb-4"></div>
          <div className="h-48 bg-gray-200 rounded"></div>
        </div>
      </div>
    }>
      <GiftsPageClient />
    </Suspense>
  );
}

