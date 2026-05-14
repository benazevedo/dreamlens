import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field


API_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_DIR.parent

load_dotenv(API_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")


class DecisionMemoInput(BaseModel):
    key: str
    idea: Dict[str, Any]
    analysis: Optional[Dict[str, Any]] = None
    validationPlan: Optional[Dict[str, Any]] = None
    researchBrief: Optional[Dict[str, Any]] = None


class DecisionMemo(BaseModel):
    key: str
    idea_name: str
    decision: str = Field(description='One of: "Pursue", "Validate", "Park", "Kill"')
    decision_score: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)

    thesis: str
    why_now: str
    strongest_evidence: List[str]
    weakest_evidence: List[str]

    best_first_wedge: str
    ideal_customer_profile: str
    likely_business_model: str
    recommended_price_test: str

    biggest_risks: List[str]
    kill_criteria: List[str]
    next_7_days: List[str]
    next_30_days: List[str]

    product_suite_potential: str
    founder_note: str


def get_model():
    model_name = os.getenv("DREAMLENS_MODEL", "gpt-4o-mini")
    return ChatOpenAI(model=model_name, temperature=0.15)


def create_decision_memo(input_data: DecisionMemoInput) -> DecisionMemo:
    model = get_model().with_structured_output(DecisionMemo)

    prompt = f"""
You are DreamLens Decision Memo Agent.

You are the final founder advisor.

Your job is to synthesize all available information and produce a clear decision memo.

Possible decisions:
- Pursue: strong candidate worth serious founder time now.
- Validate: promising but needs customer proof before commitment.
- Park: interesting but not urgent or not currently founder-fit.
- Kill: weak, too risky, too crowded, too vague, or not worth pursuing.

Be opinionated.
Do not be generically positive.
Use the evidence provided.
If research or validation data is missing, say so and lower confidence.

Input:
{input_data.model_dump()}

Scoring guidance:
- 85-100: pursue seriously
- 70-84: validate aggressively
- 50-69: park or validate lightly
- below 50: probably kill

Important:
- The best_first_wedge should be the smallest believable entry product.
- Product suite potential should explain whether this can become a company with multiple products.
- Kill criteria should be concrete and testable.
"""

    return model.invoke(prompt)
