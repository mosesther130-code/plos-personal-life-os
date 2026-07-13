"""
PLOS — Personality frameworks: metadata, scoring, code interpretation.
No LLM here — just deterministic math. AI enrichment lives in personality_service.
"""
from __future__ import annotations
from typing import Dict, List, Any, Tuple
from statistics import mean

from personality_questions import ALL_BANKS

# ----------------------------------------------------------------------------
# Framework metadata (public — surfaced on the /personality hub)
# ----------------------------------------------------------------------------
FRAMEWORKS: Dict[str, Dict[str, Any]] = {
    "big_five": {
        "id": "big_five",
        "name": "Big Five (OCEAN)",
        "short": "The most scientifically validated personality framework.",
        "dimensions": ["O", "C", "E", "A", "N"],
        "dimension_names": {
            "O": "Openness to Experience",
            "C": "Conscientiousness",
            "E": "Extraversion",
            "A": "Agreeableness",
            "N": "Neuroticism",
        },
        "question_count": 60,
        "estimated_minutes": 12,
        "response_type": "likert_5",
        "icon": "brain",
        "color": "#3B82F6",
        "science": "Costa & McCrae's five-factor model — the dominant framework in academic psychology.",
    },
    "mbti": {
        "id": "mbti",
        "name": "16 Personality Types",
        "short": "Jungian type indicator — 16 personality types.",
        "dimensions": ["EI", "SN", "TF", "JP"],
        "dimension_names": {
            "EI": "Extraversion / Introversion",
            "SN": "Sensing / Intuition",
            "TF": "Thinking / Feeling",
            "JP": "Judging / Perceiving",
        },
        "question_count": 72,
        "estimated_minutes": 15,
        "response_type": "forced_choice",
        "icon": "compass",
        "color": "#8B5CF6",
        "science": "Based on Jung's theory of psychological types; used worldwide in career and organisational contexts.",
    },
    "enneagram": {
        "id": "enneagram",
        "name": "Enneagram",
        "short": "9 interconnected types organised around core motivations.",
        "dimensions": [f"type_{i}" for i in range(1, 10)],
        "dimension_names": {
            "type_1": "The Reformer",
            "type_2": "The Helper",
            "type_3": "The Achiever",
            "type_4": "The Individualist",
            "type_5": "The Investigator",
            "type_6": "The Loyalist",
            "type_7": "The Enthusiast",
            "type_8": "The Challenger",
            "type_9": "The Peacemaker",
        },
        "question_count": 108,
        "estimated_minutes": 22,
        "response_type": "likert_5",
        "icon": "circle-dot",
        "color": "#F59E0B",
        "science": "Ancient personality system refined by modern research (Riso-Hudson, Palmer-Daniels).",
    },
    "via_strengths": {
        "id": "via_strengths",
        "name": "VIA Character Strengths",
        "short": "24 scientifically validated character strengths.",
        "dimensions": [
            "creativity", "curiosity", "judgment", "love_of_learning", "perspective",
            "bravery", "perseverance", "honesty", "zest",
            "love", "kindness", "social_intelligence",
            "teamwork", "fairness", "leadership",
            "forgiveness", "humility", "prudence", "self_regulation",
            "appreciation_beauty", "gratitude", "hope", "humor", "spirituality",
        ],
        "dimension_names": {
            "creativity": "Creativity", "curiosity": "Curiosity", "judgment": "Judgment",
            "love_of_learning": "Love of Learning", "perspective": "Perspective",
            "bravery": "Bravery", "perseverance": "Perseverance", "honesty": "Honesty", "zest": "Zest",
            "love": "Love", "kindness": "Kindness", "social_intelligence": "Social Intelligence",
            "teamwork": "Teamwork", "fairness": "Fairness", "leadership": "Leadership",
            "forgiveness": "Forgiveness", "humility": "Humility", "prudence": "Prudence",
            "self_regulation": "Self-Regulation",
            "appreciation_beauty": "Appreciation of Beauty", "gratitude": "Gratitude",
            "hope": "Hope", "humor": "Humor", "spirituality": "Spirituality",
        },
        "question_count": 96,
        "estimated_minutes": 18,
        "response_type": "likert_5",
        "icon": "star",
        "color": "#10B981",
        "science": "VIA Classification by Seligman & Peterson (University of Pennsylvania).",
    },
    "eq": {
        "id": "eq",
        "name": "Emotional Intelligence",
        "short": "5-domain EQ profile based on Goleman & Bar-On EQ-i.",
        "dimensions": ["self_awareness", "self_regulation", "motivation", "empathy", "social_skills"],
        "dimension_names": {
            "self_awareness": "Self-Awareness",
            "self_regulation": "Self-Regulation",
            "motivation": "Motivation",
            "empathy": "Empathy",
            "social_skills": "Social Skills",
        },
        "question_count": 50,
        "estimated_minutes": 12,
        "response_type": "likert_6",
        "icon": "heart-handshake",
        "color": "#EC4899",
        "science": "Based on Goleman's EQ framework and the Bar-On EQ-i model.",
    },
    "disc": {
        "id": "disc",
        "name": "DISC Profile",
        "short": "4-style behavioural assessment — fastest test in the module.",
        "dimensions": ["D", "I", "S", "C"],
        "dimension_names": {
            "D": "Dominance",
            "I": "Influence",
            "S": "Steadiness",
            "C": "Conscientiousness",
        },
        "question_count": 28,
        "estimated_minutes": 8,
        "response_type": "disc_group",
        "icon": "layout-grid",
        "color": "#EF4444",
        "science": "William Moulton Marston's four-quadrant behavioural model.",
    },
}


# ----------------------------------------------------------------------------
# Scoring
# ----------------------------------------------------------------------------
def _percentile_bucket(pct: float) -> str:
    if pct <= 33:
        return "Low"
    if pct <= 66:
        return "Average"
    return "High"


def score_big_five(responses: Dict[str, int]) -> Dict[str, Any]:
    """responses: {question_id: 1..5}"""
    bank = {q["question_id"]: q for q in ALL_BANKS["big_five"]}
    raws: Dict[str, List[int]] = {"O": [], "C": [], "E": [], "A": [], "N": []}
    for qid, val in responses.items():
        q = bank.get(qid)
        if not q:
            continue
        v = int(val)
        if q.get("reverse_scored"):
            v = 6 - v
        raws[q["dimension"]].append(v)
    scores: Dict[str, Any] = {}
    for dim, arr in raws.items():
        if not arr:
            scores[dim] = {"raw": 0, "percentile": 0, "level": "Low"}
            continue
        # each item 1-5, 12 items → max 60. Percentile ≈ (raw/60)*100 mapped through bell.
        raw = sum(arr)
        pct = round((raw - 12) / 48 * 100)
        pct = max(1, min(99, pct))
        scores[dim] = {"raw": raw, "percentile": pct, "level": _percentile_bucket(pct)}
    profile_code = "-".join(scores[d]["level"][0] for d in ["O", "C", "E", "A", "N"])
    return {"dimensions": scores, "profile_code": profile_code}


def score_mbti(responses: Dict[str, str]) -> Dict[str, Any]:
    """responses: {question_id: letter}  where letter ∈ {E,I,S,N,T,F,J,P}"""
    bank = {q["question_id"]: q for q in ALL_BANKS["mbti"]}
    counts: Dict[str, int] = {k: 0 for k in "EISNTFJP"}
    totals: Dict[str, int] = {"EI": 0, "SN": 0, "TF": 0, "JP": 0}
    for qid, val in responses.items():
        q = bank.get(qid)
        if not q:
            continue
        letter = str(val).upper()
        if letter in counts:
            counts[letter] += 1
            totals[q["dimension"]] += 1
    type_code = (
        ("E" if counts["E"] >= counts["I"] else "I") +
        ("S" if counts["S"] >= counts["N"] else "N") +
        ("T" if counts["T"] >= counts["F"] else "F") +
        ("J" if counts["J"] >= counts["P"] else "P")
    )
    splits = {
        "EI": {"E": round(100*counts["E"]/max(1,totals["EI"])), "I": round(100*counts["I"]/max(1,totals["EI"]))},
        "SN": {"S": round(100*counts["S"]/max(1,totals["SN"])), "N": round(100*counts["N"]/max(1,totals["SN"]))},
        "TF": {"T": round(100*counts["T"]/max(1,totals["TF"])), "F": round(100*counts["F"]/max(1,totals["TF"]))},
        "JP": {"J": round(100*counts["J"]/max(1,totals["JP"])), "P": round(100*counts["P"]/max(1,totals["JP"]))},
    }
    return {"type_code": type_code, "splits": splits, "counts": counts}


ENNEAGRAM_TYPE_INFO = {
    1: {"name": "The Reformer", "motivation": "To be good, right, and improve", "fear": "Being corrupt or defective", "desire": "Integrity", "stress_to": 4, "growth_to": 7, "center": "Body"},
    2: {"name": "The Helper", "motivation": "To feel loved and appreciated", "fear": "Being unwanted", "desire": "Love", "stress_to": 8, "growth_to": 4, "center": "Heart"},
    3: {"name": "The Achiever", "motivation": "To feel valuable and worthwhile", "fear": "Being worthless", "desire": "Success and admiration", "stress_to": 9, "growth_to": 6, "center": "Heart"},
    4: {"name": "The Individualist", "motivation": "To find themselves and significance", "fear": "Having no identity", "desire": "Authenticity", "stress_to": 2, "growth_to": 1, "center": "Heart"},
    5: {"name": "The Investigator", "motivation": "To be capable and competent", "fear": "Being useless or helpless", "desire": "Mastery", "stress_to": 7, "growth_to": 8, "center": "Head"},
    6: {"name": "The Loyalist", "motivation": "To have support and security", "fear": "Being without support", "desire": "Security", "stress_to": 3, "growth_to": 9, "center": "Head"},
    7: {"name": "The Enthusiast", "motivation": "To be happy and fulfilled", "fear": "Being trapped in pain", "desire": "Freedom", "stress_to": 1, "growth_to": 5, "center": "Head"},
    8: {"name": "The Challenger", "motivation": "To be self-reliant and in control", "fear": "Being harmed or controlled", "desire": "Autonomy", "stress_to": 5, "growth_to": 2, "center": "Body"},
    9: {"name": "The Peacemaker", "motivation": "To maintain inner and outer peace", "fear": "Loss of connection", "desire": "Harmony", "stress_to": 6, "growth_to": 3, "center": "Body"},
}


def score_enneagram(responses: Dict[str, int]) -> Dict[str, Any]:
    bank = {q["question_id"]: q for q in ALL_BANKS["enneagram"]}
    raws: Dict[str, int] = {f"type_{i}": 0 for i in range(1, 10)}
    for qid, val in responses.items():
        q = bank.get(qid)
        if not q:
            continue
        raws[q["dimension"]] += int(val)
    # Rank
    ranked = sorted(raws.items(), key=lambda x: x[1], reverse=True)
    primary_dim = ranked[0][0]
    primary_num = int(primary_dim.split("_")[1])
    info = ENNEAGRAM_TYPE_INFO[primary_num]
    # Wing = adjacent type with higher score
    left = primary_num - 1 if primary_num > 1 else 9
    right = primary_num + 1 if primary_num < 9 else 1
    left_score = raws[f"type_{left}"]
    right_score = raws[f"type_{right}"]
    wing = left if left_score >= right_score else right
    return {
        "raw_scores": raws,
        "primary_type": primary_num,
        "primary_name": info["name"],
        "wing": wing,
        "wing_code": f"{primary_num}w{wing}",
        "stress_direction": info["stress_to"],
        "growth_direction": info["growth_to"],
        "center": info["center"],
        "info": info,
        "ranked_types": [{"type": int(k.split("_")[1]), "score": v} for k, v in ranked],
    }


def score_via_strengths(responses: Dict[str, int]) -> Dict[str, Any]:
    bank = {q["question_id"]: q for q in ALL_BANKS["via_strengths"]}
    raws: Dict[str, int] = {}
    for qid, val in responses.items():
        q = bank.get(qid)
        if not q:
            continue
        raws.setdefault(q["dimension"], 0)
        raws[q["dimension"]] += int(val)
    ranked = sorted(raws.items(), key=lambda x: x[1], reverse=True)
    top_5 = [{"strength": k, "score": v} for k, v in ranked[:5]]
    return {
        "raw_scores": raws,
        "ranked": [{"strength": k, "score": v} for k, v in ranked],
        "signature_strengths": top_5,
    }


def score_eq(responses: Dict[str, int]) -> Dict[str, Any]:
    bank = {q["question_id"]: q for q in ALL_BANKS["eq"]}
    raws: Dict[str, List[int]] = {}
    for qid, val in responses.items():
        q = bank.get(qid)
        if not q:
            continue
        raws.setdefault(q["dimension"], []).append(int(val))
    dims = {}
    for dim, arr in raws.items():
        if not arr:
            dims[dim] = {"raw": 0, "score": 0}
            continue
        # Likert 1-6, 10 items → max 60. Normalise to 0-100.
        raw = sum(arr)
        score = round((raw - 10) / 50 * 100)
        dims[dim] = {"raw": raw, "score": max(0, min(100, score))}
    overall = round(mean([d["score"] for d in dims.values()])) if dims else 0
    if overall >= 90:
        level = "Exceptional"
    elif overall >= 75:
        level = "High"
    elif overall >= 60:
        level = "Average"
    else:
        level = "Developing"
    return {"dimensions": dims, "overall": overall, "level": level}


def score_disc(responses: Dict[str, Dict[str, str]]) -> Dict[str, Any]:
    """responses: {group_id: {"most": "D", "least": "S"}}"""
    counts = {"D": 0, "I": 0, "S": 0, "C": 0}
    for _gid, sel in responses.items():
        most = (sel or {}).get("most")
        least = (sel or {}).get("least")
        if most in counts:
            counts[most] += 1
        if least in counts:
            counts[least] -= 1
    # Normalise to positive integers for display
    min_v = min(counts.values())
    shifted = {k: v - min_v for k, v in counts.items()}
    ranked = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    primary = ranked[0][0]
    secondary = ranked[1][0]
    profile = f"{primary}{secondary}" if ranked[0][1] > 0 and ranked[1][1] >= 0 else primary
    return {"counts": counts, "shifted": shifted, "primary": primary, "secondary": secondary, "profile_code": profile, "ranked": [{"style": k, "score": v} for k, v in ranked]}


SCORERS = {
    "big_five":      score_big_five,
    "mbti":          score_mbti,
    "enneagram":     score_enneagram,
    "via_strengths": score_via_strengths,
    "eq":            score_eq,
    "disc":          score_disc,
}
