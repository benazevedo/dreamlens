import os
from pathlib import Path
from typing import List, Optional, TypedDict

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field


API_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_DIR.parent

load_dotenv(API_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")


class ValidationIdeaInput(BaseModel):
    key: str
    id: str
    rowNumber: int
    idea: str
    description: Optional[str] = None
    problemBeingSolved: str
    targetCustomers: List[str] = Field(default_factory=list)
    industries: List[str] = Field(default_factory=list)
    overallScore: Optional[int] = None
    recommendation: Optional[str] = None


class CustomerDiscoveryPlan(BaseModel):
    primary_customer: str
    customer_segments: List[str]
    pain_hypotheses: List[str]
    where_to_find_customers: List[str]
    interview_questions: List[str]
    strongest_buying_trigger: str


class MVPPlan(BaseModel):
    mvp_summary: str
    must_have_features: List[str]
    explicitly_not_in_mvp: List[str]
    fastest_build_path: str
    estimated_build_time: str
    riskiest_assumption: str


class GTMExperimentPlan(BaseModel):
    positioning_statement: str
    landing_page_headline: str
    landing_page_subheadline: str
    acquisition_channels: List[str]
    validation_experiments: List[str]
    pricing_tests: List[str]
    success_metrics: List[str]
    kill_criteria: List[str]


class ValidationPlan(BaseModel):
    key: str
    idea: str
    problem_being_solved: str
    customer_discovery: CustomerDiscoveryPlan
    mvp_plan: MVPPlan
    gtm_experiment_plan: GTMExperimentPlan
    first_7_days: List[str]
    first_30_days: List[str]
    founder_warning: str
    validation_score: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)


class ValidationState(TypedDict, total=False):
    idea: ValidationIdeaInput
    customer_discovery: CustomerDiscoveryPlan
    mvp_plan: MVPPlan
    validation_plan: ValidationPlan


def get_model():
    model_name = os.getenv("DREAMLENS_MODEL", "gpt-4o-mini")
    return ChatOpenAI(model=model_name, temperature=0.2)


def customer_discovery_agent(state: ValidationState) -> ValidationState:
    model = get_model().with_structured_output(CustomerDiscoveryPlan)
    idea = state["idea"]

    prompt = f"""
You are DreamLens Customer Discovery Agent.

Your job is to identify who has this problem, where to find them, and what to ask them.

Be practical. The founder needs to talk to real people quickly.

Idea:
{idea.idea}

Description:
{idea.description or "Not provided"}

Problem being solved:
{idea.problemBeingSolved}

Target customers:
{", ".join(idea.targetCustomers) if idea.targetCustomers else "Not provided"}

Industries:
{", ".join(idea.industries) if idea.industries else "Not provided"}

Existing recommendation:
{idea.recommendation or "Not provided"}
"""

    result = model.invoke(prompt)
    return {"customer_discovery": result}


def mvp_planning_agent(state: ValidationState) -> ValidationState:
    model = get_model().with_structured_output(MVPPlan)
    idea = state["idea"]
    discovery = state["customer_discovery"]

    prompt = f"""
You are DreamLens MVP Planning Agent.

Your job is to design the smallest realistic MVP that tests the core assumption.

Avoid overbuilding.
Prefer concierge MVPs, landing pages, mockups, manual workflows, spreadsheets, or simple prototypes when possible.

Idea:
{idea.idea}

Problem:
{idea.problemBeingSolved}

Primary customer:
{discovery.primary_customer}

Pain hypotheses:
{discovery.pain_hypotheses}
"""

    result = model.invoke(prompt)
    return {"mvp_plan": result}


def gtm_experiment_agent(state: ValidationState) -> ValidationState:
    model = get_model().with_structured_output(ValidationPlan)
    idea = state["idea"]
    discovery = state["customer_discovery"]
    mvp = state["mvp_plan"]

    prompt = f"""
You are DreamLens GTM and Validation Experiment Agent.

Create the final validation plan.

The goal is not to launch a full company yet.
The goal is to determine whether this problem is painful, reachable, and monetizable.

Idea:
{idea.model_dump()}

Customer discovery:
{discovery.model_dump()}

MVP plan:
{mvp.model_dump()}

Validation score:
Score from 0 to 100 based on how quickly and cheaply this idea can be validated, how reachable customers are, and whether the buying trigger is clear.

Include:
- first_7_days
- first_30_days
- founder_warning
- validation_score
- confidence
"""

    result = model.invoke(prompt)
    return {"validation_plan": result}


def build_validation_graph():
    graph = StateGraph(ValidationState)

    graph.add_node("customer_discovery_agent", customer_discovery_agent)
    graph.add_node("mvp_planning_agent", mvp_planning_agent)
    graph.add_node("gtm_experiment_agent", gtm_experiment_agent)

    graph.set_entry_point("customer_discovery_agent")
    graph.add_edge("customer_discovery_agent", "mvp_planning_agent")
    graph.add_edge("mvp_planning_agent", "gtm_experiment_agent")
    graph.add_edge("gtm_experiment_agent", END)

    return graph.compile()


validation_graph = build_validation_graph()


def create_validation_plan(idea: ValidationIdeaInput) -> ValidationPlan:
    result = validation_graph.invoke({"idea": idea})
    return result["validation_plan"]
