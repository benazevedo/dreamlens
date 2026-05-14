from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.idea_graph import IdeaInput, analyze_idea_with_ai
from app.agents.bulk_screen import BulkIdeaInput, analyze_ideas_bulk
from app.agents.problem_clusters import (
    ProblemCluster,
    ProblemClusterInput,
    cluster_problem_opportunities,
)
from app.agents.validation_graph import (
    ValidationIdeaInput,
    ValidationPlan,
    create_validation_plan,
)
from app.agents.research_agents import (
    ResearchIdeaInput,
    ResearchBrief,
    create_research_brief,
)


app = FastAPI(title="DreamLens API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IdeaRow(BaseModel):
    id: str
    rowNumber: int
    idea: str
    description: Optional[str] = None
    problem: Optional[str] = None
    targetAudience: Optional[str] = None
    industries: List[str] = Field(default_factory=list)


class IdeaScores(BaseModel):
    problemPain: int
    willingnessToPay: int
    marketSize: int
    customerReachability: int
    founderFit: int
    competitiveWhitespace: int
    speedToMvp: int
    grossMargin: int
    ethicsRisk: int


class Competitor(BaseModel):
    name: str
    moat: str


class AnalyzedIdea(BaseModel):
    id: str
    rowNumber: int
    idea: str
    summary: str
    problemBeingSolved: str
    targetCustomers: List[str]
    industries: List[str]
    scores: IdeaScores
    overallScore: int
    confidence: float
    estimatedPriceRange: str
    competitors: List[Competitor]
    ethicsNotes: List[str]
    suggestedNames: List[str]
    recommendation: str
    status: str


class AnalyzeRequest(BaseModel):
    ideas: List[IdeaRow]
    limit: int = 10


class ProblemClusterRequest(BaseModel):
    items: List[ProblemClusterInput]
    limit: int = 100


class ValidationPlanRequest(BaseModel):
    idea: ValidationIdeaInput


class ResearchBriefRequest(BaseModel):
    idea: ResearchIdeaInput


@app.get("/health")
def health():
    return {"status": "ok", "service": "dreamlens-api"}


@app.post("/analyze/problem-clusters", response_model=List[ProblemCluster])
def analyze_problem_clusters(request: ProblemClusterRequest):
    """
    Groups analyzed ideas by underlying customer problem.
    This helps identify company/product-suite opportunities.
    """

    limited_items = request.items[: request.limit]
    return cluster_problem_opportunities(limited_items)



@app.post("/analyze/validation-plan", response_model=ValidationPlan)
def analyze_validation_plan(request: ValidationPlanRequest):
    """
    Runs validation agents for one selected idea.
    Produces customer discovery, MVP, and GTM experiment plans.
    """

    return create_validation_plan(request.idea)



@app.post("/analyze/research-brief", response_model=ResearchBrief)
def analyze_research_brief(request: ResearchBriefRequest):
    """
    Runs live web research agents for one selected idea.
    Produces competitor, pricing, market, and evidence notes.
    """

    return create_research_brief(request.idea)


@app.post("/analyze/bulk-ai-screen", response_model=List[AnalyzedIdea])
def analyze_bulk_ai_screen(request: AnalyzeRequest):
    """
    Cheaper first-pass AI screen.
    Processes ideas in batches of 10 ideas per LLM call.
    """

    limited_ideas = request.ideas[: request.limit]
    batch_size = 10
    results: List[AnalyzedIdea] = []

    for start in range(0, len(limited_ideas), batch_size):
        batch = limited_ideas[start : start + batch_size]

        bulk_inputs = [
            BulkIdeaInput(
                id=idea.id,
                rowNumber=idea.rowNumber,
                idea=idea.idea,
                description=idea.description,
                problem=idea.problem,
                targetAudience=idea.targetAudience,
                industries=idea.industries,
            )
            for idea in batch
        ]

        bulk_results = analyze_ideas_bulk(bulk_inputs)

        idea_by_key = {
            f"{idea.id}-{idea.rowNumber}": idea
            for idea in batch
        }

        for result in bulk_results:
            key = f"{result.id}-{result.rowNumber}"
            source_idea = idea_by_key.get(key)

            competitors = [
                Competitor(
                    name=name,
                    moat="Likely competitor or substitute. Needs deep research verification.",
                )
                for name in result.likely_competitors_or_substitutes
            ]

            results.append(
                AnalyzedIdea(
                    id=result.id,
                    rowNumber=result.rowNumber,
                    idea=source_idea.idea if source_idea else result.summary,
                    summary=result.summary,
                    problemBeingSolved=result.problem_being_solved,
                    targetCustomers=result.target_customers,
                    industries=result.industries,
                    scores=IdeaScores(
                        problemPain=result.problem_pain,
                        willingnessToPay=result.willingness_to_pay,
                        marketSize=result.market_size,
                        customerReachability=result.customer_reachability,
                        founderFit=result.founder_fit,
                        competitiveWhitespace=result.competitive_whitespace,
                        speedToMvp=result.speed_to_mvp,
                        grossMargin=result.gross_margin,
                        ethicsRisk=result.ethics_risk,
                    ),
                    overallScore=result.overall_score,
                    confidence=result.confidence,
                    estimatedPriceRange=result.estimated_price_range,
                    competitors=competitors,
                    ethicsNotes=result.ethics_notes,
                    suggestedNames=result.suggested_names,
                    recommendation=result.recommendation,
                    status="completed",
                )
            )

    return results


@app.post("/analyze/ai-screen", response_model=List[AnalyzedIdea])
def analyze_ai_screen(request: AnalyzeRequest):
    """
    Deep multi-agent workflow.
    Keep this limited. Use only for selected ideas or top-ranked ideas.
    """

    limited_ideas = request.ideas[: request.limit]
    results: List[AnalyzedIdea] = []

    for idea in limited_ideas:
        ai_input = IdeaInput(
            id=idea.id,
            rowNumber=idea.rowNumber,
            idea=idea.idea,
            description=idea.description,
            problem=idea.problem,
            targetAudience=idea.targetAudience,
            industries=idea.industries,
        )

        final = analyze_idea_with_ai(ai_input)

        competitors = []
        for index, competitor_name in enumerate(final.competitors):
            moat = (
                final.competitor_moats[index]
                if index < len(final.competitor_moats)
                else "Moat not specified."
            )
            competitors.append(Competitor(name=competitor_name, moat=moat))

        results.append(
            AnalyzedIdea(
                id=idea.id,
                rowNumber=idea.rowNumber,
                idea=idea.idea,
                summary=final.summary,
                problemBeingSolved=final.problem_being_solved,
                targetCustomers=final.target_customers,
                industries=final.industries,
                scores=IdeaScores(
                    problemPain=final.problem_pain,
                    willingnessToPay=final.willingness_to_pay,
                    marketSize=final.market_size,
                    customerReachability=final.customer_reachability,
                    founderFit=final.founder_fit,
                    competitiveWhitespace=final.competitive_whitespace,
                    speedToMvp=final.speed_to_mvp,
                    grossMargin=final.gross_margin,
                    ethicsRisk=final.ethics_risk,
                ),
                overallScore=final.overall_score,
                confidence=final.confidence,
                estimatedPriceRange=final.estimated_price_range,
                competitors=competitors,
                ethicsNotes=final.ethics_notes,
                suggestedNames=final.suggested_names,
                recommendation=final.recommendation,
                status="completed",
            )
        )

    return results
