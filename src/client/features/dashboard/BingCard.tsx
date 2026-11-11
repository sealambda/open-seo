import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CardShell } from "@/client/components/CardShell";
import type { ChartConfig } from "@/client/components/ui/chart";
import { BingConnectionCard } from "@/client/features/integrations/BingConnectionCard";
import { BingWebmasterLogo } from "@/client/features/integrations/BingWebmasterLogo";
import { getBingSummary } from "@/serverFunctions/bing";
import {
  cardMetaClass,
  moreDetailsClass,
} from "@/client/features/dashboard/cardParts";
import {
  MetricRow,
  MetricsSkeleton,
  TrendChart,
} from "@/client/features/dashboard/DashboardMetrics";
import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";

const bingChartConfig = {
  clicks: { label: "Clicks", color: "var(--chart-1)" },
  impressions: { label: "Impressions", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function BingCard({
  projectId,
  connected,
}: {
  projectId: string;
  connected: boolean;
}) {
  const summaryQuery = useQuery({
    queryKey: ["dashboardBingSummary", projectId],
    queryFn: () => getBingSummary({ data: { projectId } }),
    enabled: connected,
  });
  const summaryData = summaryQuery.data;

  // Not connected (or a rejected key discovered by the report call): the
  // connection card sells and runs the whole flow itself.
  if (!connected || (summaryData && !summaryData.connected)) {
    return (
      <div id="connect-bing">
        <BingConnectionCard projectId={projectId} />
      </div>
    );
  }

  const total = summaryData?.connected ? summaryData.summary : null;
  const days =
    summaryData?.connected && summaryData.coverage.days > 0
      ? summaryData.coverage.days
      : null;

  return (
    <CardShell
      title="Bing"
      icon={<BingWebmasterLogo className="size-5" />}
      titleInfo={
        days === null ? undefined : (
          <span className={cardMetaClass}>Last {days} days</span>
        )
      }
      action={
        <Link
          to="/p/$projectId/search-performance"
          params={{ projectId }}
          search={{ source: "bing" }}
          className={moreDetailsClass}
        >
          View Bing insights
        </Link>
      }
    >
      {summaryQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load Bing data. Try again shortly.
        </p>
      ) : !summaryData?.connected ? (
        <MetricsSkeleton />
      ) : !total ? (
        <p className="text-sm text-muted-foreground">
          No Bing data yet — it can take a few days to appear after a property
          is verified.
        </p>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          {/* Bing reports one window with no earlier period to compare to. */}
          <MetricRow
            metrics={[
              {
                label: "Clicks",
                value: formatCount(total.clicks),
                change: null,
                dotClass: "bg-chart-1",
              },
              {
                label: "Impressions",
                value: formatCount(total.impressions),
                change: null,
                dotClass: "bg-chart-2",
              },
              {
                label: "Click-through rate",
                value: formatCtr(total.ctr),
                change: null,
              },
              {
                label: "Average position",
                value:
                  total.position === undefined
                    ? "—"
                    : formatPosition(total.position),
                change: null,
              },
            ]}
          />
          <TrendChart config={bingChartConfig} data={summaryData.trend} />
        </div>
      )}
    </CardShell>
  );
}
