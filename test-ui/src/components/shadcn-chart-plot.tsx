import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from 'recharts';

import { RechartsPlot, type RechartsChartType, type RechartsConfig } from '@/components/recharts-plot';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const SERIES_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
];

function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export interface ShadcnChartConfig {
  kind: 'shadcn-chart-config';
  chart_type: RechartsChartType;
  title?: string;
  data: unknown;
  mapping?: {
    x_key?: string | null;
    y_keys?: string[];
  };
  chart_config?: ChartConfig;
}

type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function inferXKey(rows: Row[], requested: string | null | undefined): string {
  if (requested && rows[0]?.[requested] !== undefined) {
    return requested;
  }
  return Object.keys(rows[0] ?? {})[0] ?? 'name';
}

function inferYKeys(rows: Row[], requested: string[] | undefined, xKey: string): string[] {
  if (!rows.length) {
    return [];
  }

  if (requested?.length) {
    return requested.filter((key) => rows[0][key] !== undefined);
  }

  const keys = Object.keys(rows[0]);
  const numericKeys = keys.filter((key) => key !== xKey && typeof rows[0][key] === 'number');

  if (numericKeys.length) {
    return numericKeys;
  }
  if (keys.length > 1) {
    return [keys[1]];
  }
  return [];
}

function buildChartConfig(yKeys: string[], provided: ChartConfig | undefined): ChartConfig {
  if (provided && Object.keys(provided).length > 0) {
    return provided;
  }

  return yKeys.reduce<ChartConfig>((acc, key, index) => {
    acc[key] = {
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (char: string) => char.toUpperCase()),
      color: seriesColor(index),
    };
    return acc;
  }, {});
}

function unsupported(message: string) {
  return (
    <div className='rounded-md border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-900'>
      {message}
    </div>
  );
}

function asRechartsConfig(config: ShadcnChartConfig): RechartsConfig {
  return {
    ...config,
    kind: 'recharts-config',
  };
}

export function ShadcnChartPlot({ config }: { config: ShadcnChartConfig }) {
  if (config.chart_type === 'Sankey' || config.chart_type === 'Treemap') {
    return <RechartsPlot config={asRechartsConfig(config)} />;
  }

  const rows = asRows(config.data);
  if (!rows.length) {
    return unsupported('Chart data is empty or not tabular.');
  }

  const xKey = inferXKey(rows, config.mapping?.x_key);
  const yKeys = inferYKeys(rows, config.mapping?.y_keys, xKey);
  const chartConfig = buildChartConfig(yKeys, config.chart_config);

  if (!yKeys.length && config.chart_type !== 'PieChart') {
    return unsupported('No y-axis keys were available for this chart.');
  }

  switch (config.chart_type) {
    case 'AreaChart':
      return (
        <ChartContainer config={chartConfig} className='min-h-[320px] w-full'>
          <AreaChart accessibilityLayer data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {yKeys.map((key) => (
              <Area key={key} type='monotone' dataKey={key} stroke={`var(--color-${key})`} fill={`var(--color-${key})`} fillOpacity={0.2} />
            ))}
          </AreaChart>
        </ChartContainer>
      );

    case 'BarChart':
      return (
        <ChartContainer config={chartConfig} className='min-h-[320px] w-full'>
          <BarChart accessibilityLayer data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {yKeys.map((key) => (
              <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={4} />
            ))}
          </BarChart>
        </ChartContainer>
      );

    case 'LineChart':
      return (
        <ChartContainer config={chartConfig} className='min-h-[320px] w-full'>
          <LineChart accessibilityLayer data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {yKeys.map((key) => (
              <Line key={key} type='monotone' dataKey={key} stroke={`var(--color-${key})`} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ChartContainer>
      );

    case 'ComposedChart': {
      const first = yKeys[0];
      const second = yKeys[1] ?? yKeys[0];
      return (
        <ChartContainer config={chartConfig} className='min-h-[320px] w-full'>
          <ComposedChart accessibilityLayer data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey={first} fill={`var(--color-${first})`} radius={4} />
            <Line type='monotone' dataKey={second} stroke={`var(--color-${second})`} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ChartContainer>
      );
    }

    case 'PieChart': {
      const pieY = yKeys[0] ?? inferYKeys(rows, undefined, xKey)[0] ?? xKey;
      return (
        <ChartContainer config={chartConfig} className='min-h-[320px] w-full'>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent nameKey={xKey} />} />
            <Pie data={rows} dataKey={pieY} nameKey={xKey} outerRadius={120}>
              {rows.map((_, index) => (
                <Cell key={`pie-cell-${index}`} fill={seriesColor(index)} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      );
    }

    case 'RadarChart': {
      const radarY = yKeys[0];
      return (
        <ChartContainer config={chartConfig} className='min-h-[320px] w-full'>
          <RadarChart data={rows}>
            <PolarGrid />
            <PolarAngleAxis dataKey={xKey} />
            <PolarRadiusAxis />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Radar dataKey={radarY} stroke={`var(--color-${radarY})`} fill={`var(--color-${radarY})`} fillOpacity={0.3} />
          </RadarChart>
        </ChartContainer>
      );
    }

    case 'RadialBarChart': {
      const radialY = yKeys[0];
      return (
        <ChartContainer config={chartConfig} className='min-h-[320px] w-full'>
          <RadialBarChart data={rows} innerRadius='25%' outerRadius='90%' startAngle={180} endAngle={0}>
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <RadialBar dataKey={radialY} fill={`var(--color-${radialY})`} />
          </RadialBarChart>
        </ChartContainer>
      );
    }

    case 'ScatterChart': {
      const scatterY = yKeys[0];
      return (
        <ChartContainer config={chartConfig} className='min-h-[320px] w-full'>
          <ScatterChart margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} name={xKey} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis dataKey={scatterY} name={scatterY} tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Scatter name={scatterY} data={rows} fill={`var(--color-${scatterY})`} />
          </ScatterChart>
        </ChartContainer>
      );
    }

    case 'FunnelChart': {
      const funnelY = yKeys[0];
      return (
        <ChartContainer config={chartConfig} className='min-h-[320px] w-full'>
          <FunnelChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent nameKey={xKey} />} />
            <Funnel data={rows} dataKey={funnelY} nameKey={xKey} isAnimationActive>
              {rows.map((_, index) => (
                <Cell key={`funnel-cell-${index}`} fill={seriesColor(index)} />
              ))}
            </Funnel>
          </FunnelChart>
        </ChartContainer>
      );
    }

    default:
      return unsupported(`Unsupported chart type: ${config.chart_type}`);
  }
}
