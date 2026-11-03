import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 inline-flex items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-emerald-400">
        404 — Page Not Found
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
        Lost in the Hood
      </h1>
      <p className="mt-4 max-w-md text-sm text-gray-400">
        The page you are looking for does not exist, has been moved, or is not accessible.
      </p>
      <div className="mt-8 flex gap-4">
        <Link href="/">
          <Button variant="primary">Return to Home</Button>
        </Link>
      </div>
    </div>
  );
}
