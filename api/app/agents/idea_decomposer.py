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


class IdeaDecompositionInput(BaseModel):
    id: str
    rowNumber: int
    idea: str
    description: Optional[str] = None
    problem: Optional[str] = None


class AtomicIdea(BaseModel):
    title: str
    description: str
    problem_being_solved: str
    target_customer: str
    product_type: str
    why_this_should_be_separate: str
    initial_score_hint: int = Field(ge=0, le=100)


class IdeaDecomposition(BaseModel):
    original_idea_summary: str
    is_compound_idea: bool
    atomic_ideas: List[AtomicIdea]
    shared_problem_themes: List[str]
    recommended_company_thesis: str
    recommended_first_wedge: str
    should_evaluate_separately: bool
    ethics_or_legal_flags: List[str]
    decomposition_confidence: float = Field(ge=0, le=1)


def get_model():
    model_name = os.getenv("DREAMLENS_MODEL", "gpt-4o-mini")
    return ChatOpenAI(model=model_name, temperature=0.15)


def decompose_idea(input_data: IdeaDecompositionInput) -> IdeaDecomposition:
    model = get_model().with_structured_output(IdeaDecomposition)

    prompt = f"""
You are DreamLens Idea Decomposer Agent.

Your job is to take a long, messy, compound startup idea and split it into clean atomic startup ideas.

An atomic idea should:
- Solve one clear customer problem
- Have one primary target customer
- Be researchable
- Be scoreable
- Be possible to validate independently

Do not force everything into one idea if the input contains multiple product concepts.

Also identify:
- shared problem themes
- whether these could become one company/product suite
- the best first wedge
- ethics/legal flags

Important:
If the idea involves scraping books, articles, video transcripts, or expert content, flag copyright/IP/data-rights concerns.

Input idea:
{input_data.idea}

Description:
{input_data.description or "Not provided"}

Existing problem:
{input_data.problem or "Not provided"}
"""

    return model.invoke(prompt)
