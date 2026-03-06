import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic_ai import FunctionToolset, RunContext

from app.core.config import settings
from app.domain.deps import AgentDeps

ChartType = Literal[
    'AreaChart',
    'BarChart',
    'LineChart',
    'ComposedChart',
    'PieChart',
    'RadarChart',
    'RadialBarChart',
    'ScatterChart',
    'FunnelChart',
    'Treemap',
    'Sankey',
]

RECHARTS_CHART_TYPES: tuple[str, ...] = (
    'AreaChart',
    'BarChart',
    'LineChart',
    'ComposedChart',
    'PieChart',
    'RadarChart',
    'RadialBarChart',
    'ScatterChart',
    'FunnelChart',
    'Treemap',
    'Sankey',
)

HIERARCHICAL_CHART_TYPES = {'Treemap', 'Sankey'}
SHADCN_SERIES_COLORS: tuple[str, ...] = (
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(var(--chart-6))',
)

visualization_toolset: FunctionToolset[AgentDeps] = FunctionToolset()


def _normalize_scalar(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _normalize_tabular_data(data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_rows: list[dict[str, Any]] = []
    for row in data:
        if not isinstance(row, dict):
            raise ValueError('Each data row must be an object/dictionary.')
        normalized_rows.append({str(key): _normalize_scalar(value) for key, value in row.items()})
    return normalized_rows


def _assert_plot_size_limit(data: Any) -> None:
    payload = json.dumps(data, ensure_ascii=False)
    payload_size = len(payload.encode('utf-8'))
    if payload_size > settings.max_plot_payload_bytes:
        raise ValueError(
            'Plot payload is too large for frontend rendering. '
            f'Limit={settings.max_plot_payload_bytes} bytes, current={payload_size} bytes.'
        )


def _infer_keys(
    chart_type: str,
    data: list[dict[str, Any]],
    x_key: str | None,
    y_keys: list[str] | None,
) -> tuple[str | None, list[str]]:
    if not data:
        raise ValueError('Plot data must contain at least one row.')

    keys = list(data[0].keys())
    if not keys:
        raise ValueError('Plot data rows must include at least one key.')

    numeric_keys = [key for key in keys if isinstance(data[0].get(key), (int, float, Decimal))]

    resolved_x_key = x_key or keys[0]

    if y_keys:
        resolved_y_keys = [key for key in y_keys if key in keys]
    else:
        resolved_y_keys = [key for key in numeric_keys if key != resolved_x_key]
        if not resolved_y_keys and len(keys) > 1:
            resolved_y_keys = [keys[1]]

    if chart_type in {'PieChart', 'RadarChart', 'RadialBarChart', 'FunnelChart', 'Treemap'}:
        resolved_y_keys = resolved_y_keys[:1]

    if chart_type == 'ScatterChart' and len(resolved_y_keys) < 1:
        raise ValueError('ScatterChart requires at least one y value key.')

    if chart_type not in HIERARCHICAL_CHART_TYPES and not resolved_y_keys:
        raise ValueError('Unable to infer y_keys. Please provide y_keys explicitly.')

    return resolved_x_key, resolved_y_keys


def _build_shadcn_chart_config(y_keys: list[str]) -> dict[str, dict[str, str]]:
    chart_config: dict[str, dict[str, str]] = {}
    for index, key in enumerate(y_keys):
        chart_config[key] = {
            'label': key.replace('_', ' ').title(),
            'color': SHADCN_SERIES_COLORS[index % len(SHADCN_SERIES_COLORS)],
        }
    return chart_config


def _iter_hierarchy_nodes(data: Any):
    if isinstance(data, dict):
        yield data
        children = data.get('children')
        if isinstance(children, list):
            for child in children:
                yield from _iter_hierarchy_nodes(child)
        return

    if isinstance(data, list):
        for item in data:
            yield from _iter_hierarchy_nodes(item)


def _infer_hierarchical_keys(
    data: dict[str, Any] | list[Any],
    x_key: str | None,
    y_keys: list[str] | None,
) -> tuple[str, list[str]]:
    resolved_x_key = x_key
    resolved_y_key = y_keys[0] if y_keys else None

    for node in _iter_hierarchy_nodes(data):
        if resolved_x_key is None:
            if isinstance(node.get('name'), str):
                resolved_x_key = 'name'
            else:
                for key, value in node.items():
                    if key == 'children':
                        continue
                    if isinstance(value, str):
                        resolved_x_key = key
                        break
                if resolved_x_key is None:
                    for key in node:
                        if key != 'children':
                            resolved_x_key = key
                            break

        if resolved_y_key is None:
            if isinstance(node.get('value'), int | float | Decimal):
                resolved_y_key = 'value'
            else:
                for key, value in node.items():
                    if key == 'children':
                        continue
                    if isinstance(value, int | float | Decimal):
                        resolved_y_key = key
                        break

        if resolved_x_key is not None and resolved_y_key is not None:
            break

    return (resolved_x_key or 'name', [resolved_y_key or 'value'])


def build_recharts_plot_config(
    chart_type: ChartType,
    data: list[dict[str, Any]] | dict[str, Any],
    x_key: str | None = None,
    y_keys: list[str] | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    if chart_type not in RECHARTS_CHART_TYPES:
        raise ValueError(
            f'Unsupported chart_type={chart_type}. Supported={", ".join(RECHARTS_CHART_TYPES)}.'
        )

    if chart_type == 'Sankey':
        if not isinstance(data, dict):
            raise ValueError('Sankey charts require object data with keys: nodes and links.')
        nodes = data.get('nodes')
        links = data.get('links')
        if not isinstance(nodes, list) or not isinstance(links, list):
            raise ValueError('Sankey data must include list fields: nodes and links.')
        if len(nodes) > settings.max_plot_data_points or len(links) > settings.max_plot_data_points:
            raise ValueError(
                'Sankey data exceeds limits. '
                f'max_plot_data_points={settings.max_plot_data_points} for nodes/links.'
            )
        normalized_sankey = {
            'nodes': _normalize_tabular_data([node for node in nodes if isinstance(node, dict)]),
            'links': _normalize_tabular_data([link for link in links if isinstance(link, dict)]),
        }
        _assert_plot_size_limit(normalized_sankey)
        return {
            'kind': 'recharts-config',
            'chart_type': chart_type,
            'title': title or 'Sankey Flow',
            'data': normalized_sankey,
            'mapping': {
                'x_key': None,
                'y_keys': [],
            },
        }

    if chart_type == 'Treemap':
        if not isinstance(data, (dict, list)):
            raise ValueError(f'{chart_type} requires hierarchical object or list data.')
        if isinstance(data, list) and len(data) > settings.max_plot_data_points:
            raise ValueError(
                f'{chart_type} data exceeds max_plot_data_points={settings.max_plot_data_points}.'
            )
        resolved_x_key, resolved_y_keys = _infer_hierarchical_keys(data, x_key, y_keys)
        _assert_plot_size_limit(data)
        return {
            'kind': 'recharts-config',
            'chart_type': chart_type,
            'title': title or chart_type,
            'data': data,
            'mapping': {
                'x_key': resolved_x_key,
                'y_keys': resolved_y_keys,
            },
        }

    if not isinstance(data, list):
        raise ValueError(f'{chart_type} expects tabular list[object] data.')

    if not data:
        raise ValueError('Plot data must not be empty.')

    if len(data) > settings.max_plot_data_points:
        raise ValueError(
            'Plot data point limit exceeded. '
            f'max_plot_data_points={settings.max_plot_data_points}, received={len(data)}.'
        )

    normalized_rows = _normalize_tabular_data(data)
    resolved_x_key, resolved_y_keys = _infer_keys(chart_type, normalized_rows, x_key, y_keys)
    _assert_plot_size_limit(normalized_rows)

    return {
        'kind': 'recharts-config',
        'chart_type': chart_type,
        'title': title or chart_type,
        'data': normalized_rows,
        'mapping': {
            'x_key': resolved_x_key,
            'y_keys': resolved_y_keys,
        },
    }


def build_shadcn_plot_config(
    chart_type: ChartType,
    data: list[dict[str, Any]] | dict[str, Any],
    x_key: str | None = None,
    y_keys: list[str] | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    recharts_config = build_recharts_plot_config(
        chart_type=chart_type,
        data=data,
        x_key=x_key,
        y_keys=y_keys,
        title=title,
    )
    mapping = recharts_config.get('mapping', {})
    resolved_y_keys = mapping.get('y_keys', [])
    if not isinstance(resolved_y_keys, list):
        resolved_y_keys = []

    return {
        **recharts_config,
        'kind': 'shadcn-chart-config',
        'chart_config': _build_shadcn_chart_config(resolved_y_keys),
    }


def build_plot_config(
    chart_type: ChartType,
    data: list[dict[str, Any]] | dict[str, Any],
    x_key: str | None = None,
    y_keys: list[str] | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    """Backwards-compatible alias for recharts config builders."""
    return build_recharts_plot_config(
        chart_type=chart_type,
        data=data,
        x_key=x_key,
        y_keys=y_keys,
        title=title,
    )


@visualization_toolset.tool
async def create_recharts_plot(
    ctx: RunContext[AgentDeps],
    chart_type: ChartType,
    data: list[dict[str, Any]] | dict[str, Any],
    x_key: str | None = None,
    y_keys: list[str] | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    """
    Build a frontend-friendly Recharts plot configuration.

    Supported chart types:
    AreaChart, BarChart, LineChart, ComposedChart, PieChart, RadarChart,
    RadialBarChart, ScatterChart, FunnelChart, Treemap, Sankey.

    Guardrails:
    - Enforces row-count and payload-size limits to prevent frontend overload.
    - Raises errors when required mappings are missing.
    """
    return build_recharts_plot_config(
        chart_type=chart_type,
        data=data,
        x_key=x_key,
        y_keys=y_keys,
        title=title,
    )


@visualization_toolset.tool
async def create_shadcn_plot(
    ctx: RunContext[AgentDeps],
    chart_type: ChartType,
    data: list[dict[str, Any]] | dict[str, Any],
    x_key: str | None = None,
    y_keys: list[str] | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    """
    Build a shadcn-style chart configuration that works with ChartContainer,
    ChartTooltip, and ChartLegend components.

    Supported chart types:
    AreaChart, BarChart, LineChart, ComposedChart, PieChart, RadarChart,
    RadialBarChart, ScatterChart, FunnelChart, Treemap, Sankey.
    """
    return build_shadcn_plot_config(
        chart_type=chart_type,
        data=data,
        x_key=x_key,
        y_keys=y_keys,
        title=title,
    )
