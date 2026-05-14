import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from tavily import TavilyClient


API_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_DIR.parent

load_dotenv(API_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")

MAX_TAVILY_QUERY_LENGTH = 390


class ResearchIdeaInput(BaseModel):
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


class SearchQueryPlan(BaseModel):
    competitor_query: str = Field(
        description="A concise search query under 390 characters for finding competitors and alternatives."
    )
    pricing_query: str = Field(
        description="A concise search query under 390 characters for finding pricing and willingness-to-pay evidence."
    )
    market_query: str = Field(
        description="A concise search query under 390 characters for finding market size, trends, and demand evidence."
    )


class ResearchSource(BaseModel):
    title: str
    url: str
    content: str


class ResearchBrief(BaseModel):
    key: str
    idea: str
    problem_being_solved: str

    competitor_summary: str
    competitors: List[str]
    competitor_moats: List[str]

    pricing_summary: str
    likely_price_range: str
    willingness_to_pay_notes: List[str]

    market_summary: str
    market_evidence: List[str]

    risks_and_unknowns: List[str]
    recommended_next_research_steps: List[str]

    evidence_quality: str
    confidence: float = Field(ge=0, le=1)
    sources: List[ResearchSource]


def get_model():
    model_name = os.getenv("DREAMLENS_MODEL", "gpt-4o-mini")
    return ChatOpenAI(model=model_name, temperature=0.15)


def get_tavily_client() -> TavilyClient:
    api_key = os.getenv("TAVILY_API_KEY")

    if not api_key:
        raise ValueError(
            "TAVILY_API_KEY is missing. Add it to /dreamlens/.env or /dreamlens/api/.env."
        )

    return TavilyClient(api_key=api_key)


def safe_query(query: str) -> str:
    """
    Tavily rejects queries over 400 chars.
    This hard guard prevents one bad idea description from crashing the endpoint.
    """
    cleaned = " ".join(query.split())

    if len(cleaned) <= MAX_TAVILY_QUERY_LENGTH:
        return cleaned

    return cleaned[:MAX_TAVILY_QUERY_LENGTH].rsplit(" ", 1)[0]


def truncate_source_content(content: str, max_chars: int = 700) -> str:
    cleaned = " ".join((content or "").split())

    if len(cleaned) <= max_chars:
        return cleaned

    return cleaned[:max_chars].rsplit(" ", 1)[0] + "..."


def create_search_query_plan(idea: ResearchIdeaInput) -> SearchQueryPlan:
    """
    Search Query Agent.
    Converts a potentially long idea/problem/customer description into short,
    Tavily-safe search queries.
    """

    model = get_model().with_structured_output(SearchQueryPlan)

    prompt = f"""
You are DreamLens Search Query Agent.

Your job is to create three concise web search queries for Tavily.

Hard rules:
- Each query must be under 390 characters.
- Do not include long descriptions.
- Use only the most important keywords.
- Prefer concrete product/category/customer terms.
- Do not write full sentences if a keyword query is better.

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

Create:
1. competitor_query
2. pricing_query
3. market_query
"""

    plan = model.invoke(prompt)

    return SearchQueryPlan(
        competitor_query=safe_query(plan.competitor_query),
        pricing_query=safe_query(plan.pricing_query),
        market_query=safe_query(plan.market_query),
    )


def search_tavily(query: str, max_results: int = 5) -> List[ResearchSource]:
    client = get_tavily_client()
    query = safe_query(query)

    response = client.search(
        query=query,
        max_results=max_results,
        search_depth="basic",
        include_answer=False,
        include_raw_content=False,
    )

    results = response.get("results", [])

    return [
        ResearchSource(
            title=item.get("title", "Untitled source"),
            url=item.get("url", ""),
            content=truncate_source_content(item.get("content", "")),
        )
        for item in results
    ]


def create_research_brief(idea: ResearchIdeaInput) -> ResearchBrief:
    query_plan = create_search_query_plan(idea)

    competitor_sources = search_tavily(query_plan.competitor_query, max_results=5)
    pricing_sources = search_tavily(query_plan.pricing_query, max_results=5)
    market_sources = search_tavily(query_plan.market_query, max_results=5)

    all_sources = competitor_sources + pricing_sources + market_sources

    # De-duplicate sources by URL.
    unique_sources_by_url = {}
    for source in all_sources:
        if source.url and source.url not in unique_sources_by_url:
            unique_sources_by_url[source.url] = source

    unique_sources = list(unique_sources_by_url.values())

    model = get_model().with_structured_output(ResearchBrief)

    prompt = f"""
You are DreamLens Evidence Summary Agent.

You are producing an evidence-grounded research brief for one startup idea.

Your source material comes from live web search results.
Do not invent competitors, prices, or market evidence beyond what is supported by the sources.
If evidence is weak, say so clearly.

Idea:
{idea.model_dump()}

Search Query Agent output:
{query_plan.model_dump()}

Sources:
{[source.model_dump() for source in unique_sources]}

Create:
- competitor_summary
- competitors
- competitor_moats
- pricing_summary
- likely_price_range
- willingness_to_pay_notes
- market_summary
- market_evidence
- risks_and_unknowns
- recommended_next_research_steps
- evidence_quality: one of "weak", "medium", "strong"
- confidence
- sources

Important:
- Keep source URLs exactly as provided.
- Include only sources that are relevant.
- Be skeptical.
- This is not a final investment memo; it is a first-pass research brief.
"""

    brief = model.invoke(prompt)
    return brief
