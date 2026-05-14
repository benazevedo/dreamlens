import os
from pathlib import Path
from typing import List, Optional, TypedDict

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field

# Load env vars from both the backend folder and the project root.
# This lets you keep .env in either:
#   /dreamlens/api/.env
#   /dreamlens/.env
API_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_DIR.parent

load_dotenv(API_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")


class IdeaInput(BaseModel):
    id: str
    rowNumber: int
    idea: str
    description: Optional[str] = None
    problem: Optional[str] = None
    targetAudience: Optional[str] = None
    industries: List[str] = Field(default_factory=list)


class NormalizedIdea(BaseModel):
    cleaned_idea: str = Field(description="A clear one-sentence version of the idea.")
    problem_summary: str = Field(description="The core customer problem.")
    target_customers: List[str] = Field(description="Likely customer segments.")
    likely_industries: List[str] = Field(description="Industries this idea belongs to.")
    business_model: str = Field(description="Likely business model.")


class BusinessScores(BaseModel):
    problem_pain: int = Field(ge=1, le=5)
    willingness_to_pay: int = Field(ge=1, le=5)
    market_size: int = Field(ge=1, le=5)
    customer_reachability: int = Field(ge=1, le=5)
    founder_fit: int = Field(ge=1, le=5)
    competitive_whitespace: int = Field(ge=1, le=5)
    speed_to_mvp: int = Field(ge=1, le=5)
    gross_margin: int = Field(ge=1, le=5)

    estimated_price_range: str
    reasoning: str


class RiskAndCompetition(BaseModel):
    ethics_risk: int = Field(ge=1, le=5)
    ethics_notes: List[str]
    competitors: List[str]
    competitor_moats: List[str]
    market_risk_notes: List[str]
    confidence: float = Field(ge=0, le=1)


class FinalIdeaAnalysis(BaseModel):
    summary: str
    target_customers: List[str]
    industries: List[str]
    problem_pain: int = Field(ge=1, le=5)
    willingness_to_pay: int = Field(ge=1, le=5)
    market_size: int = Field(ge=1, le=5)
    customer_reachability: int = Field(ge=1, le=5)
    founder_fit: int = Field(ge=1, le=5)
    competitive_whitespace: int = Field(ge=1, le=5)
    speed_to_mvp: int = Field(ge=1, le=5)
    gross_margin: int = Field(ge=1, le=5)
    ethics_risk: int = Field(ge=1, le=5)
    overall_score: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    estimated_price_range: str
    competitors: List[str]
    competitor_moats: List[str]
    ethics_notes: List[str]
    suggested_names: List[str]
    recommendation: str


class IdeaState(TypedDict, total=False):
    idea: IdeaInput
    normalized: NormalizedIdea
    business_scores: BusinessScores
    risk_competition: RiskAndCompetition
    final: FinalIdeaAnalysis


def get_model():
    model_name = os.getenv("DREAMLENS_MODEL", "gpt-4o-mini")
    return ChatOpenAI(model=model_name, temperature=0.2)


def normalize_idea_node(state: IdeaState) -> IdeaState:
    model = get_model().with_structured_output(NormalizedIdea)
    idea = state["idea"]

    prompt = f"""
You are DreamLens Agent 1: Idea Normalizer.

Your job:
- Rewrite the idea clearly.
- Identify the actual customer problem.
- Infer likely customers.
- Infer likely industries.
- Infer likely business model.

Use only the information provided. Do not pretend to have done live web research.

Idea:
{idea.idea}

Description:
{idea.description or "Not provided"}

Problem being solved:
{idea.problem or "Not provided"}

Existing target audience:
{idea.targetAudience or "Not provided"}

Existing industry tags:
{", ".join(idea.industries) if idea.industries else "Not provided"}
"""

    normalized = model.invoke(prompt)
    return {"normalized": normalized}


def business_scoring_node(state: IdeaState) -> IdeaState:
    model = get_model().with_structured_output(BusinessScores)
    idea = state["idea"]
    normalized = state["normalized"]

    prompt = f"""
You are DreamLens Agent 2: Business Viability Analyst.

Score this startup idea from 1 to 5 on each dimension.

Scoring rules:
1 = very weak
2 = weak
3 = moderate
4 = strong
5 = excellent

Be critical. Do not give everything a 3 or 4.
Use the full range of scores when justified.

Evaluate:
- problem_pain
- willingness_to_pay
- market_size
- customer_reachability
- founder_fit
- competitive_whitespace
- speed_to_mvp
- gross_margin
- estimated price range
- reasoning

Founder-fit note:
Assume the founder can build software/AI prototypes, but does not automatically have deep industry distribution, regulatory expertise, hardware manufacturing, or enterprise sales access.

Original idea:
{idea.idea}

Cleaned idea:
{normalized.cleaned_idea}

Problem:
{normalized.problem_summary}

Target customers:
{", ".join(normalized.target_customers)}

Business model:
{normalized.business_model}
"""

    scores = model.invoke(prompt)
    return {"business_scores": scores}


def risk_competition_node(state: IdeaState) -> IdeaState:
    model = get_model().with_structured_output(RiskAndCompetition)
    normalized = state["normalized"]
    business = state["business_scores"]

    prompt = f"""
You are DreamLens Agent 3: Competition, Risk, and Ethics Analyst.

Analyze the idea for:
- likely competitors or substitutes
- what moats those competitors may have
- ethical, legal, safety, privacy, or social risks
- market risks
- confidence in your assessment

Important:
- You do not have live web access in this version.
- Competitors should be treated as likely examples, not verified live research.
- Be especially strict for medical, children, student, legal, financial, security, surveillance, and regulated ideas.

Cleaned idea:
{normalized.cleaned_idea}

Problem:
{normalized.problem_summary}

Target customers:
{", ".join(normalized.target_customers)}

Industries:
{", ".join(normalized.likely_industries)}

Business scoring reasoning:
{business.reasoning}
"""

    risk = model.invoke(prompt)
    return {"risk_competition": risk}


def final_synthesis_node(state: IdeaState) -> IdeaState:
    model = get_model().with_structured_output(FinalIdeaAnalysis)
    normalized = state["normalized"]
    business = state["business_scores"]
    risk = state["risk_competition"]

    prompt = f"""
You are DreamLens Agent 4: Final Startup Idea Synthesizer.

Create the final structured analysis.

Use this weighted score logic:
- Problem pain: 15%
- Willingness to pay: 15%
- Market size: 15%
- Customer reachability: 10%
- Founder fit: 10%
- Competitive whitespace: 10%
- Speed to MVP: 10%
- Gross margin: 10%
- Ethics risk: subtract a penalty. Higher ethics risk should reduce the score.

The final overall_score must be 0 to 100.
Use the full range:
- Below 40 = weak or not worth pursuing
- 40-59 = maybe, but not promising
- 60-74 = promising but needs validation
- 75-89 = strong candidate
- 90+ = rare, exceptional candidate

Do not cluster everything around 50-65.

Normalized idea:
{normalized.model_dump()}

Business scores:
{business.model_dump()}

Risk and competition:
{risk.model_dump()}
"""

    final = model.invoke(prompt)
    return {"final": final}


def build_idea_graph():
    graph = StateGraph(IdeaState)

    graph.add_node("normalize_idea_agent", normalize_idea_node)
    graph.add_node("business_scoring_agent", business_scoring_node)
    graph.add_node("risk_competition_agent", risk_competition_node)
    graph.add_node("final_synthesis_agent", final_synthesis_node)

    graph.set_entry_point("normalize_idea_agent")
    graph.add_edge("normalize_idea_agent", "business_scoring_agent")
    graph.add_edge("business_scoring_agent", "risk_competition_agent")
    graph.add_edge("risk_competition_agent", "final_synthesis_agent")
    graph.add_edge("final_synthesis_agent", END)

    return graph.compile()


idea_graph = build_idea_graph()


def analyze_idea_with_ai(idea: IdeaInput) -> FinalIdeaAnalysis:
    result = idea_graph.invoke({"idea": idea})
    return result["final"]
