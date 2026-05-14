from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.idea_graph import IdeaInput, analyze_idea_with_ai


app = FastAPI(title="DreamLens API", version="0.2.0")

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
    limit: int = 5


@app.get("/health")
def health():
    return {"status": "ok", "service": "dreamlens-api"}


@app.post("/analyze/ai-screen", response_model=List[AnalyzedIdea])
def analyze_ai_screen(request: AnalyzeRequest):
    """
    Real AI workflow.
    Limit defaults to 5 so you do not accidentally run 309 paid LLM workflows at once.
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
