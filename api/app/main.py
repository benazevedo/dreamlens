from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="DreamLens API", version="0.1.0")

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


@app.get("/health")
def health():
    return {"status": "ok", "service": "dreamlens-api"}


def clamp_score(value: int) -> int:
    return max(1, min(5, value))


def fake_score_idea(idea: IdeaRow) -> AnalyzedIdea:
    """
    Temporary deterministic scorer.
    This lets us test the full UI/backend loop before paying for AI calls.
    Later this function gets replaced by the LangGraph workflow.
    """

    text = f"{idea.idea} {idea.description or ''} {idea.problem or ''}".lower()

    pain = 3
    if any(word in text for word in ["urgent", "expensive", "waste", "pain", "problem", "manual", "slow"]):
        pain += 1

    wtp = 3
    if any(word in text for word in ["business", "enterprise", "company", "medical", "security", "legal"]):
        wtp += 1

    market = 3
    if any(word in text for word in ["ai", "health", "education", "finance", "food", "energy"]):
        market += 1

    reachability = 3
    if idea.targetAudience:
        reachability += 1

    speed = 3
    if any(word in text for word in ["app", "software", "tool", "platform", "dashboard"]):
        speed += 1
    if any(word in text for word in ["hardware", "medical device", "construction", "infrastructure"]):
        speed -= 1

    ethics = 2
    if any(word in text for word in ["medical", "health", "children", "student", "security", "surveillance", "legal"]):
        ethics += 1

    competition = 3
    if "ai" in text:
        competition -= 1

    scores = IdeaScores(
        problemPain=clamp_score(pain),
        willingnessToPay=clamp_score(wtp),
        marketSize=clamp_score(market),
        customerReachability=clamp_score(reachability),
        founderFit=3,
        competitiveWhitespace=clamp_score(competition),
        speedToMvp=clamp_score(speed),
        grossMargin=4,
        ethicsRisk=clamp_score(ethics),
    )

    positive_score = (
        scores.problemPain * 15
        + scores.willingnessToPay * 15
        + scores.marketSize * 15
        + scores.customerReachability * 10
        + scores.founderFit * 10
        + scores.competitiveWhitespace * 10
        + scores.speedToMvp * 10
        + scores.grossMargin * 10
    )

    risk_penalty = scores.ethicsRisk * 5
    overall = round((positive_score - risk_penalty) / 5)

    base_name = "".join(word.capitalize() for word in idea.idea.split()[:2]) or "DreamLens"

    return AnalyzedIdea(
        id=idea.id,
        rowNumber=idea.rowNumber,
        idea=idea.idea,
        summary=(idea.description or idea.problem or "No description provided.")[:280],
        targetCustomers=[idea.targetAudience] if idea.targetAudience else ["Needs customer definition"],
        industries=idea.industries or ["Unclassified"],
        scores=scores,
        overallScore=overall,
        confidence=0.42,
        estimatedPriceRange="Needs AI research",
        competitors=[
            Competitor(
                name="Needs research",
                moat="Competitor research will be added in the LangGraph workflow.",
            )
        ],
        ethicsNotes=[
            "Temporary heuristic result.",
            "Full ethics review will be added with AI analysis.",
        ],
        suggestedNames=[
            base_name,
            f"{base_name} AI",
            f"{base_name} Labs",
        ],
        recommendation="Temporary fast-screen score. Needs LangGraph analysis.",
        status="completed",
    )


@app.post("/analyze/fast-screen", response_model=List[AnalyzedIdea])
def analyze_fast_screen(request: AnalyzeRequest):
    return [fake_score_idea(idea) for idea in request.ideas]
