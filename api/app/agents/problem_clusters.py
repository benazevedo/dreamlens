import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field


API_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_DIR.parent

load_dotenv(API_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")


class ProblemClusterInput(BaseModel):
    key: str
    id: str
    rowNumber: int
    idea: str
    problemBeingSolved: str
    targetCustomers: List[str] = Field(default_factory=list)
    industries: List[str] = Field(default_factory=list)
    overallScore: int | None = None
    recommendation: str | None = None


class ProblemCluster(BaseModel):
    clusterId: str
    title: str
    problemStatement: str
    primaryCustomer: str
    industries: List[str]
    ideaKeys: List[str]
    productSuiteStrategy: str
    whyTheseBelongTogether: str
    suggestedCompanyNames: List[str]
    opportunityScore: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)


class ProblemClusterOutput(BaseModel):
    clusters: List[ProblemCluster]


def get_model():
    model_name = os.getenv("DREAMLENS_MODEL", "gpt-4o-mini")

    return ChatOpenAI(
        model=model_name,
        temperature=0.15,
        max_tokens=5000,
    )


def cluster_problem_opportunities(
    items: List[ProblemClusterInput],
) -> List[ProblemCluster]:
    if not items:
        return []

    model = get_model().with_structured_output(ProblemClusterOutput)

    compact_items = [
        {
            "key": item.key,
            "id": item.id,
            "rowNumber": item.rowNumber,
            "idea": item.idea,
            "problemBeingSolved": item.problemBeingSolved,
            "targetCustomers": item.targetCustomers,
            "industries": item.industries,
            "overallScore": item.overallScore,
            "recommendation": item.recommendation,
        }
        for item in items
    ]

    prompt = f"""
You are DreamLens Problem Clustering Agent.

Your job is to group startup ideas by the underlying customer problem, not by surface-level product format.

Philosophy:
Start with a painful problem. Then identify many possible solutions/products around that problem.
A strong cluster may represent a potential company, with the ideas acting as product lines, features, wedges, or expansion opportunities.

Rules:
- Use the exact input key values in ideaKeys.
- Group ideas when they solve the same or strongly related customer problem.
- Do not group ideas together only because they use AI or share a broad industry.
- Prefer meaningful clusters with 2+ ideas, but singleton clusters are allowed for unique ideas.
- Create a concise reusable problem statement for each cluster.
- The productSuiteStrategy should explain how this could become one company with multiple products.
- opportunityScore should consider problem pain, willingness to pay, market size, focus, and coherence of the cluster.
- High opportunityScore should be rare.
- Return no more than 15 clusters unless necessary.

Ideas to cluster:
{compact_items}
"""

    output = model.invoke(prompt)
    return output.clusters
