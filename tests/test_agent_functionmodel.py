
import json

import pytest
from pydantic_ai import DeferredToolRequests
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.core.config import settings
from app.domain.deps import AgentDeps
from app.services.agent_registry import build_agent
from app.tools import build_plot_config, build_shadcn_plot_config


def _function_model_with_single_tool_call(
    tool_name: str,
    args: dict[str, object],
    final_text: str,
) -> FunctionModel:
    def call(messages: list[ModelMessage], _info: AgentInfo) -> ModelResponse:
        saw_tool_return = False
        for message in messages:
            if isinstance(message, ModelRequest):
                for part in message.parts:
                    if isinstance(part, ToolReturnPart):
                        saw_tool_return = True
                        break
            if saw_tool_return:
                break

        if saw_tool_return:
            return ModelResponse(parts=[TextPart(final_text)])

        return ModelResponse(
            parts=[
                ToolCallPart(
                    tool_name=tool_name,
                    args=json.dumps(args),
                    tool_call_id='call-1',
                )
            ]
        )

    return FunctionModel(call)


@pytest.mark.asyncio
async def test_functionmodel_runs_simple_tool_and_returns_text() -> None:
    agent = build_agent(
        _function_model_with_single_tool_call(
            tool_name='add_numbers',
            args={'a': 14, 'b': 29},
            final_text='calculation complete',
        )
    )

    result = await agent.run(
        'Add 14 and 29',
        deps=AgentDeps(user_id='user-1', user_email='u@example.com'),
    )

    assert result.output == 'calculation complete'


@pytest.mark.asyncio
async def test_functionmodel_deferred_tool_returns_deferred_requests() -> None:
    agent = build_agent(
        _function_model_with_single_tool_call(
            tool_name='queue_deferred_report',
            args={'topic': 'quarterly anomalies'},
            final_text='done',
        )
    )

    result = await agent.run(
        'Queue a deferred report for quarterly anomalies',
        deps=AgentDeps(user_id='user-2', user_email='u2@example.com'),
    )

    assert isinstance(result.output, DeferredToolRequests)
    assert result.output.calls
    first_call = result.output.calls[0]
    metadata = result.output.metadata.get(first_call.tool_call_id or '', {})
    assert metadata.get('topic') == 'quarterly anomalies'


@pytest.mark.asyncio
async def test_functionmodel_deferred_single_choice_exposes_question_and_options() -> None:
    agent = build_agent(
        _function_model_with_single_tool_call(
            tool_name='ask_user_single_choice',
            args={
                'question': 'Pick a deployment region',
                'options': ['us-east-1', 'eu-west-1', 'ap-south-1'],
            },
            final_text='done',
        )
    )

    result = await agent.run(
        'Ask me to choose a deployment region first',
        deps=AgentDeps(user_id='user-2b', user_email='u2b@example.com'),
    )

    assert isinstance(result.output, DeferredToolRequests)
    assert result.output.calls
    first_call = result.output.calls[0]
    metadata = result.output.metadata.get(first_call.tool_call_id or '', {})
    assert metadata.get('interaction') == 'single-select'
    assert metadata.get('question') == 'Pick a deployment region'
    assert metadata.get('options') == ['us-east-1', 'eu-west-1', 'ap-south-1']


@pytest.mark.asyncio
async def test_functionmodel_approval_required_returns_deferred_requests() -> None:
    agent = build_agent(
        _function_model_with_single_tool_call(
            tool_name='rotate_service_api_key',
            args={'key_name': 'payments-service', 'reason': 'credential leaked'},
            final_text='done',
        )
    )

    result = await agent.run(
        'Rotate payments-service key',
        deps=AgentDeps(user_id='user-3', user_email='u3@example.com'),
    )

    assert isinstance(result.output, DeferredToolRequests)
    assert result.output.approvals
    first_approval = result.output.approvals[0]
    metadata = result.output.metadata.get(first_approval.tool_call_id or '', {})
    assert metadata.get('key_name') == 'payments-service'

def test_plot_config_enforces_data_point_limit() -> None:
    too_many_rows = [
        {'month': str(index), 'cost': index * 10}
        for index in range(settings.max_plot_data_points + 1)
    ]

    with pytest.raises(ValueError, match='Plot data point limit exceeded'):
        build_plot_config(
            chart_type='LineChart',
            data=too_many_rows,
            x_key='month',
            y_keys=['cost'],
            title='Monthly Cost',
        )


def test_plot_config_builds_sankey_spec() -> None:
    config = build_plot_config(
        chart_type='Sankey',
        data={
            'nodes': [{'name': 'Compute'}, {'name': 'Storage'}],
            'links': [{'source': 0, 'target': 1, 'value': 42}],
        },
        title='Spend Flow',
    )

    assert config['kind'] == 'recharts-config'
    assert config['chart_type'] == 'Sankey'


def test_shadcn_plot_config_includes_chart_config() -> None:
    config = build_shadcn_plot_config(
        chart_type='BarChart',
        data=[
            {'month': 'Jan', 'desktop': 10, 'mobile': 4},
            {'month': 'Feb', 'desktop': 20, 'mobile': 6},
        ],
        x_key='month',
        y_keys=['desktop', 'mobile'],
        title='Visitors',
    )

    assert config['kind'] == 'shadcn-chart-config'
    assert config['chart_type'] == 'BarChart'
    assert config['chart_config']['desktop']['color'] == 'hsl(var(--chart-1))'
    assert config['chart_config']['mobile']['color'] == 'hsl(var(--chart-2))'

def _build_calculator_agent(tool_name: str, args: dict[str, object], final_text: str):
    """Build a calculator agent with a FunctionModel that calls a single tool."""
    from pydantic_ai import Agent, DeferredToolRequests

    from app.tools.calculator_tools import calculator_toolset

    model = _function_model_with_single_tool_call(
        tool_name=tool_name,
        args=args,
        final_text=final_text,
    )
    return Agent(
        model,
        deps_type=AgentDeps,
        output_type=[str, DeferredToolRequests],
        system_prompt='You are a calculator assistant.',
        toolsets=[calculator_toolset],
    )


@pytest.mark.asyncio
async def test_calculator_add() -> None:
    agent = _build_calculator_agent('add', {'a': 10, 'b': 5}, 'done')
    result = await agent.run(
        'Add 10 and 5',
        deps=AgentDeps(user_id='calc-user'),
    )
    assert result.output == 'done'


@pytest.mark.asyncio
async def test_calculator_subtract() -> None:
    agent = _build_calculator_agent('subtract', {'a': 10, 'b': 3}, 'result ready')
    result = await agent.run(
        'Subtract 3 from 10',
        deps=AgentDeps(user_id='calc-user'),
    )
    assert result.output == 'result ready'


@pytest.mark.asyncio
async def test_calculator_multiply() -> None:
    agent = _build_calculator_agent('multiply', {'a': 7, 'b': 6}, '42')
    result = await agent.run(
        'Multiply 7 by 6',
        deps=AgentDeps(user_id='calc-user'),
    )
    assert result.output == '42'


@pytest.mark.asyncio
async def test_calculator_divide() -> None:
    agent = _build_calculator_agent('divide', {'a': 20, 'b': 4}, '5')
    result = await agent.run(
        'Divide 20 by 4',
        deps=AgentDeps(user_id='calc-user'),
    )
    assert result.output == '5'


@pytest.mark.asyncio
async def test_calculator_divide_by_zero() -> None:
    from app.tools.calculator_tools import divide
    from pydantic_ai import RunContext

    ctx = RunContext.__new__(RunContext)
    object.__setattr__(ctx, 'deps', AgentDeps(user_id='test'))
    object.__setattr__(ctx, 'tool_call_approved', False)

    with pytest.raises(ValueError, match='Cannot divide by zero'):
        await divide(ctx, 10, 0)
