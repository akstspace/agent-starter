import type { ReactNode } from 'react';

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
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts';

const SERIES_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
];

function chartColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export type RechartsChartType =
  | 'AreaChart'
  | 'BarChart'
  | 'LineChart'
  | 'ComposedChart'
  | 'PieChart'
  | 'RadarChart'
  | 'RadialBarChart'
  | 'ScatterChart'
  | 'FunnelChart'
  | 'Treemap'
  | 'Sankey';

export interface RechartsConfig {
  kind: 'recharts-config';
  chart_type: RechartsChartType;
  title?: string;
  data: unknown;
  mapping?: {
    x_key?: string | null;
    y_keys?: string[];
  };
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

function walkHierarchy(value: unknown, visit: (node: Row) => boolean | void): boolean {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (walkHierarchy(item, visit)) {
        return true;
      }
    }
    return false;
  }

  if (!isRecord(value)) {
    return false;
  }

  if (visit(value) === true) {
    return true;
  }

  return walkHierarchy(value.children, visit);
}

function hasNumericHierarchyKey(data: unknown, key: string): boolean {
  return walkHierarchy(data, (node) => typeof node[key] === 'number');
}

function inferHierarchyNameKey(data: unknown, requested: string | null | undefined): string {
  if (requested) {
    return requested;
  }

  let inferred: string | null = null;
  walkHierarchy(data, (node) => {
    if (typeof node.name === 'string') {
      inferred = 'name';
      return true;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'children') {
        continue;
      }
      if (typeof value === 'string') {
        inferred = key;
        return true;
      }
    }

    for (const key of Object.keys(node)) {
      if (key !== 'children') {
        inferred = key;
        return true;
      }
    }

    return false;
  });

  return inferred ?? 'name';
}

function inferHierarchyValueKey(data: unknown, requested: string | undefined): string {
  if (requested && hasNumericHierarchyKey(data, requested)) {
    return requested;
  }

  let inferred: string | null = null;
  walkHierarchy(data, (node) => {
    if (typeof node.value === 'number') {
      inferred = 'value';
      return true;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'children') {
        continue;
      }
      if (typeof value === 'number') {
        inferred = key;
        return true;
      }
    }

    return false;
  });

  return inferred ?? requested ?? 'value';
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
  const candidates = keys.filter((key) => {
    if (key === xKey) {
      return false;
    }
    const sample = rows[0][key];
    return typeof sample === 'number';
  });

  if (candidates.length) {
    return candidates;
  }

  if (keys.length > 1) {
    return [keys[1]];
  }

  return [];
}

function guardContainer(children: ReactNode) {
  return <div className='h-[360px] w-full'>{children}</div>;
}

function unsupported(message: string) {
  return (
    <div className='rounded-md border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-900'>
      {message}
    </div>
  );
}

export function RechartsPlot({ config }: { config: RechartsConfig }) {
  const rows = asRows(config.data);
  const xKey = inferXKey(rows, config.mapping?.x_key);
  const yKeys = inferYKeys(rows, config.mapping?.y_keys, xKey);

  if (config.chart_type === 'Sankey') {
    if (!isRecord(config.data) || !Array.isArray(config.data.nodes) || !Array.isArray(config.data.links)) {
      return unsupported('Sankey expects { nodes: [], links: [] }.');
    }

    return guardContainer(
      <ResponsiveContainer width='100%' height='100%'>
        <Sankey data={config.data as never} nodePadding={20} margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
          <Tooltip />
        </Sankey>
      </ResponsiveContainer>,
    );
  }

  if (config.chart_type === 'Treemap') {
    const treemapData = Array.isArray(config.data) ? config.data : [config.data];
    const treemapNameKey = inferHierarchyNameKey(config.data, config.mapping?.x_key);
    const treemapValueKey = inferHierarchyValueKey(config.data, config.mapping?.y_keys?.[0]);
    if (!hasNumericHierarchyKey(config.data, treemapValueKey)) {
      return unsupported(`Treemap could not find numeric data key "${treemapValueKey}".`);
    }

    return guardContainer(
      <ResponsiveContainer width='100%' height='100%'>
        <Treemap
          data={treemapData as never}
          dataKey={treemapValueKey}
          nameKey={treemapNameKey}
          stroke='hsl(var(--border))'
          fill={chartColor(0)}
        >
          <Tooltip />
        </Treemap>
      </ResponsiveContainer>,
    );
  }

  if (!rows.length) {
    return unsupported('Chart data is empty or not tabular.');
  }

  if (!yKeys.length && config.chart_type !== 'PieChart') {
    return unsupported('No y-axis keys were available for this chart.');
  }

  switch (config.chart_type) {
    case 'AreaChart':
      return guardContainer(
        <ResponsiveContainer width='100%' height='100%'>
          <AreaChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {yKeys.map((key, index) => (
              <Area key={key} type='monotone' dataKey={key} stroke={chartColor(index)} fill={chartColor(index)} fillOpacity={0.25} />
            ))}
          </AreaChart>
        </ResponsiveContainer>,
      );

    case 'BarChart':
      return guardContainer(
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {yKeys.map((key, index) => (
              <Bar key={key} dataKey={key} fill={chartColor(index)} radius={[6, 6, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>,
      );

    case 'LineChart':
      return guardContainer(
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {yKeys.map((key, index) => (
              <Line key={key} type='monotone' dataKey={key} stroke={chartColor(index)} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>,
      );

    case 'ComposedChart': {
      const first = yKeys[0];
      const second = yKeys[1] ?? yKeys[0];
      return guardContainer(
        <ResponsiveContainer width='100%' height='100%'>
          <ComposedChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey={first} fill={chartColor(0)} radius={[6, 6, 0, 0]} />
            <Line type='monotone' dataKey={second} stroke={chartColor(1)} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>,
      );
    }

    case 'PieChart': {
      const pieY = yKeys[0] ?? inferYKeys(rows, undefined, xKey)[0] ?? xKey;
      return guardContainer(
        <ResponsiveContainer width='100%' height='100%'>
          <PieChart>
            <Tooltip />
            <Legend />
            <Pie data={rows} dataKey={pieY} nameKey={xKey} outerRadius={120}>
              {rows.map((_, index) => (
                <Cell key={`pie-cell-${index}`} fill={chartColor(index)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>,
      );
    }

    case 'RadarChart': {
      const radarY = yKeys[0];
      return guardContainer(
        <ResponsiveContainer width='100%' height='100%'>
          <RadarChart data={rows}>
            <Tooltip />
            <Legend />
            <Radar dataKey={radarY} stroke={chartColor(0)} fill={chartColor(0)} fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>,
      );
    }

    case 'RadialBarChart': {
      const radialY = yKeys[0];
      return guardContainer(
        <ResponsiveContainer width='100%' height='100%'>
          <RadialBarChart innerRadius='10%' outerRadius='90%' data={rows} startAngle={180} endAngle={0}>
            <Tooltip />
            <Legend />
            <RadialBar dataKey={radialY} fill={chartColor(0)} />
          </RadialBarChart>
        </ResponsiveContainer>,
      );
    }

    case 'ScatterChart': {
      const scatterY = yKeys[0];
      return guardContainer(
        <ResponsiveContainer width='100%' height='100%'>
          <ScatterChart margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey={xKey} name={xKey} />
            <YAxis dataKey={scatterY} name={scatterY} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
            <Scatter name={scatterY} data={rows} fill={chartColor(0)} />
          </ScatterChart>
        </ResponsiveContainer>,
      );
    }

    case 'FunnelChart': {
      const funnelY = yKeys[0];
      return guardContainer(
        <ResponsiveContainer width='100%' height='100%'>
          <FunnelChart>
            <Tooltip />
            <Legend />
            <Funnel dataKey={funnelY} data={rows} nameKey={xKey} isAnimationActive>
              {rows.map((_, index) => (
                <Cell key={`funnel-cell-${index}`} fill={chartColor(index)} />
              ))}
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>,
      );
    }

    default:
      return unsupported(`Unsupported chart type: ${config.chart_type}`);
  }
}
