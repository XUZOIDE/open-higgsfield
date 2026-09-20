import type { Metadata } from "next";
import Link from "next/link";

import { currentUserId } from "@/generation/current-user";
import { listDailyCosts } from "@/generation/session-store";
import { CostsDashboard } from "@/openhiggsfield/costs-dashboard";

import "@/openhiggsfield/costs.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Usage & costs",
  robots: { index: false, follow: false },
};

export default async function CostsPage() {
  const days = await listDailyCosts(await currentUserId());
  return (
    <main className="costs-page">
      <header className="costs-head">
        <div>
          <p className="costs-kicker">OpenHiggsfield AI</p>
          <h1>Usage &amp; costs</h1>
          <p>Private estimates for your generations, grouped by São Paulo date.</p>
        </div>
        <Link className="costs-back" href="/">Back to studio</Link>
      </header>
      <CostsDashboard initialDays={days} />
    </main>
  );
}
