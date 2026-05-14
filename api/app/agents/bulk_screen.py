import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field


API_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_DIR.parent

load_dotenv(API_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")


class BulkIdeaInput(BaseModel):
    id: str
    rowNumber: int
    idea: str
    description: Optional[str] = None
    problem: Optional[str] = None
    targetAudience: Optional[str] = None
    industries: List[str] = Field(default_factory=list)


class QuickIdeaAnalysis(BaseModel):
    id: str
    rowNumber: int
    summary: str
    problem_being_solved: str
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
    likely_competitors_or_substitutes: List[str]
    ethics_notes: List[str]
    suggested_names: List[str]
    recommendation: str


class BulkScreenOutput(BaseModel):
    results: List[QuickIdeaAnalysis]


def get_model():
    model_name = os.getenv("DREAMLENS_MODEL", "gpt-4o-mini")

    return ChatOpenAI(
        model=model_name,
        temperature=0.1,
        max_tokens=6000,
    )


def analyze_ideas_bulk(ideas: List[BulkIdeaInput]) -> List[QuickIdeaAnalysis]:
    model = get_model().with_structured_output(BulkScreenOutput)

    compact_ideas = [
        {
            "id": idea.id,
            "rowNumber": idea.rowNumber,
            "idea": idea.idea,
            "description": idea.description,
            "problem": idea.problem,
            "targetAudience": idea.targetAudience,
            "industries": idea.industries,
        }
        for idea in ideas
    ]

    prompt = f"""
You are DreamLens Bulk Screen Agent.

Analyze this batch of startup ideas quickly and critically.

For each idea, infer the clearest underlying customer problem.
This is very important because multiple ideas may solve the same problem.
The field problem_being_solved should be a concise, reusable problem statement.

This is NOT the deep-research pass.
Do not write long explanations.
Do not pretend to have live web research.
Use concise judgment based on the idea, problem, customer, and industry.

Score each category from 1 to 5:
1 = very weak
2 = weak
3 = moderate
4 = strong
5 = excellent

Important scoring guidance:
- Use the full score range.
- Do not cluster everything between 50 and 65.
- A boring, vague, hard-to-sell idea should score below 45.
- A decent but unvalidated idea should score 50–70.
- A genuinely strong idea can score 75–90.
- 90+ should be rare.
- High ethics risk should lower the overall score.
- Competitive whitespace means lower competition / clearer opening is better.
- Founder fit assumes the founder can build AI/software prototypes but does not automatically have deep regulated-industry access, hardware expertise, or enterprise distribution.

Return one result for every input idea.

Ideas:
{compact_ideas}
"""

    output = model.invoke(prompt)
    return output.results
