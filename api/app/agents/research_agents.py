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


def search_tavily(query: str, max_results: int = 5) -> List[ResearchSource]:
    client = get_tavily_client()

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
            content=item.get("content", ""),
        )
        for item in results
    ]


def create_research_brief(idea: ResearchIdeaInput) -> ResearchBrief:
    target_customer_text = ", ".join(idea.targetCustomers) if idea.targetCustomers else "target customers"
    industry_text = ", ".join(idea.industries) if idea.industries else "startup market"

    competitor_query = (
        f"competitors alternatives for {idea.idea} solving {idea.problemBeingSolved} "
        f"for {target_customer_text}"
    )

    pricing_query = (
        f"pricing willingness to pay software tools for {target_customer_text} "
        f"solving {idea.problemBeingSolved}"
    )

    market_query = (
        f"market size trends {industry_text} {idea.problemBeingSolved} startup opportunity"
    )

    competitor_sources = search_tavily(competitor_query, max_results=5)
    pricing_sources = search_tavily(pricing_query, max_results=5)
    market_sources = search_tavily(market_query, max_results=5)

    all_sources = competitor_sources + pricing_sources + market_sources

    model = get_model().with_structured_output(ResearchBrief)

    prompt = f"""
You are DreamLens Research Agents.

You are producing an evidence-grounded research brief for one startup idea.

Your source material comes from live web search results.
Do not invent competitors, prices, or market evidence beyond what is supported by the sources.
If evidence is weak, say so clearly.

Idea:
{idea.model_dump()}

Competitor search query:
{competitor_query}

Pricing search query:
{pricing_query}

Market search query:
{market_query}

Sources:
{[source.model_dump() for source in all_sources]}

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
