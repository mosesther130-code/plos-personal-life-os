"""
PLOS — Personality Assessment Question Banks (Phase 1).
Curated public-domain psychology items. All 414 items across 6 frameworks:
  - Big Five (60, 12/dim, Likert 5)   — IPIP-style
  - MBTI-style (72, 18/dim pair, forced choice)
  - Enneagram (108, 12/type, Likert 5)
  - VIA Strengths (96, 4/strength, Likert 5)
  - EQ (50, 10/domain, Likert 6)
  - DISC (28 groups of 4, MOST/LEAST)

Dimension keys are stable; scoring modules key off them.
"""
from __future__ import annotations
from typing import List, Dict, Any

# ---------------------------------------------------------------------------
# BIG FIVE — IPIP items (60 total, 12/dim, mix positively/reverse keyed)
# ---------------------------------------------------------------------------
BIG_FIVE: List[Dict[str, Any]] = []

def _bf(dim, text, reverse=False):
    BIG_FIVE.append({
        "assessment_type": "big_five",
        "question_id": f"bf_{dim}_{len([q for q in BIG_FIVE if q['dimension']==dim])+1:02d}",
        "dimension": dim,
        "question_text": text,
        "response_type": "likert_5",
        "reverse_scored": reverse,
    })

# Openness (O) — 12
for t, r in [
    ("I have a vivid imagination.", False),
    ("I enjoy exploring abstract or philosophical ideas.", False),
    ("I am curious about many different things.", False),
    ("I appreciate art, music, or poetry.", False),
    ("I have excellent ideas.", False),
    ("I reflect deeply on things.", False),
    ("I have a rich vocabulary.", False),
    ("I try to understand people from many cultures.", False),
    ("I have difficulty understanding abstract ideas.", True),
    ("I do not have a good imagination.", True),
    ("I avoid philosophical discussions.", True),
    ("I am not interested in abstract theories.", True),
]:
    _bf("O", t, r)

# Conscientiousness (C) — 12
for t, r in [
    ("I am always prepared.", False),
    ("I pay attention to details.", False),
    ("I get chores done right away.", False),
    ("I like order and organization.", False),
    ("I follow a schedule.", False),
    ("I am exacting in my work.", False),
    ("I complete tasks successfully.", False),
    ("I leave my belongings around.", True),
    ("I make a mess of things.", True),
    ("I often forget to put things back in their proper place.", True),
    ("I shirk my duties.", True),
    ("I neglect my duties.", True),
]:
    _bf("C", t, r)

# Extraversion (E) — 12
for t, r in [
    ("I feel comfortable around people.", False),
    ("I am the life of the party.", False),
    ("I start conversations easily.", False),
    ("I talk to a lot of different people at parties.", False),
    ("I do not mind being the center of attention.", False),
    ("I make friends easily.", False),
    ("I don't talk a lot.", True),
    ("I keep in the background.", True),
    ("I have little to say.", True),
    ("I don't like to draw attention to myself.", True),
    ("I am quiet around strangers.", True),
    ("I find it difficult to approach others.", True),
]:
    _bf("E", t, r)

# Agreeableness (A) — 12
for t, r in [
    ("I am interested in people.", False),
    ("I sympathize with others' feelings.", False),
    ("I have a soft heart.", False),
    ("I take time out for others.", False),
    ("I feel others' emotions.", False),
    ("I make people feel at ease.", False),
    ("I am not really interested in others.", True),
    ("I insult people.", True),
    ("I am not interested in other people's problems.", True),
    ("I feel little concern for others.", True),
    ("I am indifferent to the feelings of others.", True),
    ("I contradict others.", True),
]:
    _bf("A", t, r)

# Neuroticism (N) — 12  (high score = more neurotic)
for t, r in [
    ("I get stressed out easily.", False),
    ("I worry about things.", False),
    ("I am easily disturbed.", False),
    ("I get upset easily.", False),
    ("I change my mood a lot.", False),
    ("I have frequent mood swings.", False),
    ("I get irritated easily.", False),
    ("I often feel blue.", False),
    ("I am relaxed most of the time.", True),
    ("I seldom feel blue.", True),
    ("I am not easily bothered by things.", True),
    ("I rarely get irritated.", True),
]:
    _bf("N", t, r)

assert len(BIG_FIVE) == 60, f"BIG_FIVE expected 60, got {len(BIG_FIVE)}"

# ---------------------------------------------------------------------------
# MBTI-style — 72 forced-choice, 18 per dimension pair (EI, SN, TF, JP)
# For each: option_a maps to left letter, option_b maps to right letter.
# ---------------------------------------------------------------------------
MBTI: List[Dict[str, Any]] = []

def _mb(dim, a, b, a_letter, b_letter):
    MBTI.append({
        "assessment_type": "mbti",
        "question_id": f"mb_{dim}_{len([q for q in MBTI if q['dimension']==dim])+1:02d}",
        "dimension": dim,
        "question_text": "Which describes you better?",
        "response_type": "forced_choice",
        "options": [
            {"text": a, "value": a_letter},
            {"text": b, "value": b_letter},
        ],
    })

# EI — 18
EI_PAIRS = [
    ("I get energy from being around people.", "I get energy from time alone."),
    ("I think out loud.", "I think things through internally first."),
    ("I have many friends.", "I have a few close friends."),
    ("I talk more than I listen at parties.", "I listen more than I talk."),
    ("I dive into new social situations.", "I observe before joining."),
    ("I feel drained by long solitude.", "I feel drained by long social events."),
    ("I share personal thoughts freely.", "I keep personal thoughts private."),
    ("I prefer group projects.", "I prefer solo projects."),
    ("I speak first, reflect later.", "I reflect first, then speak."),
    ("Meeting new people energizes me.", "Meeting new people takes effort."),
    ("I think while talking.", "I need silence to think clearly."),
    ("I love brainstorming with others.", "I brainstorm better alone."),
    ("I feel bored when alone too long.", "I feel restored when alone."),
    ("I approach strangers easily.", "I wait to be approached."),
    ("I express feelings openly.", "I process feelings privately."),
    ("Small talk energizes me.", "Small talk drains me."),
    ("I recharge with friends.", "I recharge in solitude."),
    ("I enjoy being the center of attention.", "I prefer staying in the background."),
]
for a, b in EI_PAIRS:
    _mb("EI", a, b, "E", "I")

# SN — 18
SN_PAIRS = [
    ("I focus on concrete facts.", "I focus on patterns and possibilities."),
    ("I trust experience.", "I trust hunches."),
    ("I like realistic details.", "I like abstract concepts."),
    ("I describe things literally.", "I describe things metaphorically."),
    ("I prefer proven methods.", "I prefer innovative approaches."),
    ("I notice specifics first.", "I notice the big picture first."),
    ("I like step-by-step instructions.", "I like open-ended possibilities."),
    ("I am practical.", "I am imaginative."),
    ("I prefer non-fiction.", "I prefer fiction and speculation."),
    ("I remember exact details.", "I remember overall impressions."),
    ("I focus on what is.", "I focus on what could be."),
    ("I trust facts more than theories.", "I trust theories more than facts."),
    ("I like tangible results.", "I like exploring ideas."),
    ("I am attentive to the present.", "I am attentive to the future."),
    ("I appreciate tradition.", "I appreciate change."),
    ("I take instructions literally.", "I read between the lines."),
    ("I focus on 'what happened'.", "I focus on 'what might happen'."),
    ("I trust my five senses.", "I trust my imagination."),
]
for a, b in SN_PAIRS:
    _mb("SN", a, b, "S", "N")

# TF — 18
TF_PAIRS = [
    ("I decide with logic.", "I decide with values."),
    ("I prioritize truth over tact.", "I prioritize tact over blunt truth."),
    ("I analyze objectively.", "I consider feelings first."),
    ("I value consistency.", "I value harmony."),
    ("I critique work directly.", "I frame feedback gently."),
    ("I focus on principles.", "I focus on people."),
    ("I am fair-minded.", "I am compassionate."),
    ("I question emotions.", "I honor emotions."),
    ("Justice matters most.", "Mercy matters most."),
    ("I prefer objective standards.", "I prefer flexible standards."),
    ("I distance myself to judge.", "I empathize to judge."),
    ("I follow logic even when it hurts.", "I bend logic to protect feelings."),
    ("I value competence.", "I value warmth."),
    ("I say what needs saying.", "I say what needs hearing."),
    ("I dispassionately analyze problems.", "I emotionally invest in problems."),
    ("I make cold, hard decisions.", "I make caring, considerate decisions."),
    ("I am comfortable with disagreement.", "I seek consensus."),
    ("I evaluate based on merit.", "I evaluate based on impact on people."),
]
for a, b in TF_PAIRS:
    _mb("TF", a, b, "T", "F")

# JP — 18
JP_PAIRS = [
    ("I like plans and schedules.", "I like flexibility and spontaneity."),
    ("I decide quickly.", "I keep options open."),
    ("I complete tasks early.", "I work best under deadline."),
    ("I want closure on decisions.", "I want to explore all possibilities."),
    ("I make to-do lists.", "I go with the flow."),
    ("I prefer routines.", "I prefer variety."),
    ("I feel calmer when things are settled.", "I feel calmer with options open."),
    ("I finish one thing before starting another.", "I juggle many things at once."),
    ("I set clear goals.", "I stay adaptive."),
    ("I dislike changing plans.", "I love changing plans."),
    ("I prefer decisive action.", "I prefer wait-and-see."),
    ("I stick to a budget.", "I spend as inspired."),
    ("I plan trips in detail.", "I improvise on trips."),
    ("I hate being late.", "I lose track of time."),
    ("I prepare well in advance.", "I prepare at the last minute."),
    ("I value structure.", "I value freedom."),
    ("I like knowing what comes next.", "I like being surprised."),
    ("I work steadily to the deadline.", "I rush at the end with adrenaline."),
]
for a, b in JP_PAIRS:
    _mb("JP", a, b, "J", "P")

assert len(MBTI) == 72, f"MBTI expected 72, got {len(MBTI)}"


# ---------------------------------------------------------------------------
# ENNEAGRAM — 108, 12 per type (types 1-9), Likert 5
# ---------------------------------------------------------------------------
ENNEAGRAM: List[Dict[str, Any]] = []

def _en(type_num, text):
    dim = f"type_{type_num}"
    ENNEAGRAM.append({
        "assessment_type": "enneagram",
        "question_id": f"en_{dim}_{len([q for q in ENNEAGRAM if q['dimension']==dim])+1:02d}",
        "dimension": dim,
        "question_text": text,
        "response_type": "likert_5",
        "reverse_scored": False,
    })

# 1 — Reformer
for t in [
    "I have a strong inner critic that pushes me to do things correctly.",
    "I believe there is a right way to do most things.",
    "I strive for improvement and perfection.",
    "I feel frustrated when standards are not met.",
    "I have a strong sense of right and wrong.",
    "I value order and discipline highly.",
    "I hold myself to very high standards.",
    "I feel responsible for making things better.",
    "I try to control my anger and impatience.",
    "I compare myself to how things ought to be.",
    "I notice mistakes and imperfections easily.",
    "I feel dissatisfied when I fall short of my ideals.",
]:
    _en(1, t)

# 2 — Helper
for t in [
    "I focus on the needs of others often before my own.",
    "I want to be needed by those I love.",
    "I pride myself on being generous.",
    "I have trouble asking for help.",
    "I show my love by doing things for people.",
    "I notice what others need without being told.",
    "I sometimes feel unappreciated for all I give.",
    "I feel valued when I am helpful.",
    "I struggle to set boundaries.",
    "I sacrifice my own needs for others.",
    "I want to be seen as kind and thoughtful.",
    "I take pride in supporting others.",
]:
    _en(2, t)

# 3 — Achiever
for t in [
    "I am highly motivated to succeed.",
    "I care about my public image and reputation.",
    "I adapt myself to what will impress others.",
    "I set ambitious goals and drive toward them.",
    "I fear being seen as a failure.",
    "I am competitive and results-focused.",
    "I package myself well for different audiences.",
    "I struggle to slow down and rest.",
    "I define my worth by my accomplishments.",
    "I lose touch with my feelings when working.",
    "I want to be admired.",
    "I hide my failures from others.",
]:
    _en(3, t)

# 4 — Individualist
for t in [
    "I feel fundamentally different from other people.",
    "I have intense emotions that shift often.",
    "I long for something that is missing in my life.",
    "I want to be seen as unique and authentic.",
    "I am drawn to melancholy and beauty.",
    "I feel envy toward what others seem to have.",
    "I express myself through art or creativity.",
    "I dislike being ordinary.",
    "I dwell on painful feelings.",
    "I feel misunderstood.",
    "I want deep, meaningful connections.",
    "I explore my inner emotional world.",
]:
    _en(4, t)

# 5 — Investigator
for t in [
    "I need lots of alone time to recharge.",
    "I observe from a distance before engaging.",
    "I am energized by acquiring knowledge.",
    "I have specialized interests I dive deep into.",
    "I guard my time and energy carefully.",
    "I feel drained by too much social contact.",
    "I prefer thinking over feeling.",
    "I keep my thoughts and possessions private.",
    "I want to understand how things work.",
    "I feel more competent alone than with others.",
    "I detach from strong emotions to think clearly.",
    "I minimize my needs so I need less from others.",
]:
    _en(5, t)

# 6 — Loyalist
for t in [
    "I question authority even while relying on it.",
    "I anticipate what could go wrong.",
    "I am loyal to people and groups I trust.",
    "I feel more secure with clear rules.",
    "I worry about worst-case scenarios.",
    "I look for reassurance in decisions.",
    "I am suspicious of new people at first.",
    "I want reliable structures and support.",
    "I am courageous when I overcome my fear.",
    "I am uneasy without a plan.",
    "I test people's trustworthiness.",
    "I feel anxious when facing uncertainty.",
]:
    _en(6, t)

# 7 — Enthusiast
for t in [
    "I fill my life with variety and adventure.",
    "I avoid pain and boredom.",
    "I have many interests and projects going at once.",
    "I plan future experiences to look forward to.",
    "I dislike being tied down.",
    "I find silver linings in every situation.",
    "I am energetic and quick-thinking.",
    "I struggle to finish what I start.",
    "I brainstorm many options.",
    "I get restless when things slow down.",
    "I want to fully experience life.",
    "I move on quickly from difficult feelings.",
]:
    _en(7, t)

# 8 — Challenger
for t in [
    "I take charge naturally.",
    "I confront issues directly.",
    "I protect the people I care about.",
    "I dislike showing weakness.",
    "I speak my mind bluntly.",
    "I am comfortable with conflict.",
    "I feel angry when I sense injustice.",
    "I want to be in control of my life.",
    "I have a big presence in the room.",
    "I test others to see if they are trustworthy.",
    "I stand up for the underdog.",
    "I am impatient with hesitation.",
]:
    _en(8, t)

# 9 — Peacemaker
for t in [
    "I go along with others to keep the peace.",
    "I dislike conflict and confrontation.",
    "I merge with the priorities of others.",
    "I procrastinate on tasks I dislike.",
    "I feel calm and settled.",
    "I see all sides of an issue.",
    "I lose sight of my own preferences.",
    "I fall into comforting routines.",
    "I resist being pushed or pressured.",
    "I minimize problems to stay comfortable.",
    "I forget to prioritize myself.",
    "I mediate disagreements between others.",
]:
    _en(9, t)

assert len(ENNEAGRAM) == 108, f"ENNEAGRAM expected 108, got {len(ENNEAGRAM)}"


# ---------------------------------------------------------------------------
# VIA CHARACTER STRENGTHS — 96 items, 4 per strength, Likert 5
# ---------------------------------------------------------------------------
VIA: List[Dict[str, Any]] = []

def _via(strength, text):
    VIA.append({
        "assessment_type": "via_strengths",
        "question_id": f"via_{strength}_{len([q for q in VIA if q['dimension']==strength])+1:02d}",
        "dimension": strength,
        "question_text": text,
        "response_type": "likert_5",
        "reverse_scored": False,
    })

VIA_STRENGTHS: Dict[str, List[str]] = {
    "creativity":         ["I come up with new and different ideas.", "I like to think of novel ways to do things.", "People say I am inventive.", "I enjoy creative activities like art, writing, or design."],
    "curiosity":          ["I am interested in many different things.", "I love exploring new subjects.", "I ask lots of questions.", "I find the world fascinating."],
    "judgment":           ["I weigh evidence carefully before deciding.", "I think through both sides of an issue.", "I question my own assumptions.", "I avoid jumping to conclusions."],
    "love_of_learning":   ["I love acquiring new skills.", "I read widely to learn.", "I actively seek out new knowledge.", "Learning something new is a highlight of my day."],
    "perspective":        ["People come to me for advice.", "I can see the big picture.", "I offer wise counsel to friends.", "I connect experiences to draw meaningful lessons."],
    "bravery":            ["I speak up even when it's unpopular.", "I face fears rather than avoid them.", "I stand up for what I believe.", "I take moral stands under pressure."],
    "perseverance":       ["I finish what I start.", "I keep working even when tasks get hard.", "I do not give up easily.", "I stick to my long-term goals."],
    "honesty":            ["I tell the truth even when it's uncomfortable.", "I keep my promises.", "I present myself authentically.", "I take responsibility for my actions."],
    "zest":               ["I approach life with energy and excitement.", "I look forward to each new day.", "I bring enthusiasm to what I do.", "I feel alive and vibrant."],
    "love":               ["I have close, loving relationships.", "I express affection openly.", "I feel deeply connected to loved ones.", "I am there for people I care about."],
    "kindness":           ["I help others whenever I can.", "I do favors for people without being asked.", "I am generous with my time.", "I take care of the people around me."],
    "social_intelligence":["I read people's emotions well.", "I know how to fit into different social situations.", "I understand what motivates others.", "I sense the mood of a group."],
    "teamwork":           ["I work well as part of a team.", "I put group success above my own recognition.", "I contribute fully to shared efforts.", "I am loyal to the groups I belong to."],
    "fairness":           ["I treat all people equally.", "I don't play favorites.", "I stand up against unfair treatment.", "I give people the chance they deserve."],
    "leadership":         ["I organize group activities effectively.", "People look to me for direction.", "I motivate others toward shared goals.", "I take charge when needed."],
    "forgiveness":        ["I let go of grudges.", "I give people second chances.", "I don't hold on to anger.", "I forgive myself for past mistakes."],
    "humility":           ["I don't seek the spotlight.", "I acknowledge my mistakes.", "I let my work speak for itself.", "I recognize what I don't know."],
    "prudence":           ["I think before I act.", "I avoid unnecessary risks.", "I plan carefully before decisions.", "I consider long-term consequences."],
    "self_regulation":    ["I control my emotions when needed.", "I resist impulses that don't serve me.", "I stick to healthy habits.", "I manage my time well."],
    "appreciation_beauty":["I notice beauty in everyday moments.", "I feel moved by great art or nature.", "I pause to appreciate my surroundings.", "I am inspired by excellence in any form."],
    "gratitude":          ["I count my blessings often.", "I say thank you frequently.", "I feel grateful for what I have.", "I don't take good things for granted."],
    "hope":               ["I expect the best from the future.", "I stay optimistic even in hard times.", "I believe things will work out.", "I set goals I truly believe I can reach."],
    "humor":              ["I make others laugh.", "I find humor in most situations.", "I enjoy playfulness.", "I don't take myself too seriously."],
    "spirituality":       ["I have a strong sense of purpose.", "I feel connected to something larger than myself.", "My values guide my daily choices.", "I reflect on the meaning of my life."],
}
for strength, items in VIA_STRENGTHS.items():
    for t in items:
        _via(strength, t)

assert len(VIA) == 96, f"VIA expected 96, got {len(VIA)}"


# ---------------------------------------------------------------------------
# EMOTIONAL INTELLIGENCE — 50 items, 10 per domain, Likert 6 (Never→Always)
# ---------------------------------------------------------------------------
EQ: List[Dict[str, Any]] = []

def _eq(dim, text):
    EQ.append({
        "assessment_type": "eq",
        "question_id": f"eq_{dim}_{len([q for q in EQ if q['dimension']==dim])+1:02d}",
        "dimension": dim,
        "question_text": text,
        "response_type": "likert_6",
        "reverse_scored": False,
    })

EQ_ITEMS = {
    "self_awareness": [
        "I can name what I am feeling in the moment.",
        "I know what triggers my strongest emotions.",
        "I understand how my mood affects my behavior.",
        "I recognize when I am becoming stressed.",
        "I know my emotional strengths and weaknesses.",
        "I notice patterns in my emotional reactions.",
        "I understand why I feel the way I do.",
        "I recognize when my values are being violated.",
        "I sense when a decision feels wrong to me.",
        "I know when I need a break.",
    ],
    "self_regulation": [
        "I stay calm under pressure.",
        "I pause before reacting when upset.",
        "I recover quickly from setbacks.",
        "I choose how to respond rather than react automatically.",
        "I keep disruptive emotions from interfering with my work.",
        "I take responsibility for my emotional reactions.",
        "I manage my anger constructively.",
        "I resist impulses that would harm my goals.",
        "I redirect my attention when overwhelmed.",
        "I regulate my mood through healthy habits.",
    ],
    "motivation": [
        "I set clear goals for myself.",
        "I stay committed even when progress is slow.",
        "I find intrinsic meaning in my work.",
        "I push through discomfort to reach my aims.",
        "I feel driven by more than money or status.",
        "I initiate action without waiting to be told.",
        "I bounce back after failure.",
        "I focus on long-term rewards over short-term gains.",
        "I energize myself when tasks are hard.",
        "I see obstacles as challenges to solve.",
    ],
    "empathy": [
        "I sense how others are feeling.",
        "I read non-verbal cues accurately.",
        "I put myself in other people's shoes.",
        "I notice when someone is upset even if they hide it.",
        "I understand different perspectives.",
        "I ask about others' feelings sincerely.",
        "I listen to understand, not just respond.",
        "I show that I understand others' emotions.",
        "I care about the well-being of people I don't know well.",
        "I adjust my behavior to what others need.",
    ],
    "social_skills": [
        "I build rapport with new people quickly.",
        "I resolve conflicts constructively.",
        "I communicate my needs clearly.",
        "I influence others in positive ways.",
        "I collaborate well across differences.",
        "I give feedback that lands well.",
        "I inspire people to work toward common goals.",
        "I nurture my important relationships.",
        "I network naturally.",
        "I create a positive atmosphere around me.",
    ],
}
for dim, items in EQ_ITEMS.items():
    for t in items:
        _eq(dim, t)

assert len(EQ) == 50, f"EQ expected 50, got {len(EQ)}"


# ---------------------------------------------------------------------------
# DISC — 28 groups of 4 descriptors; user picks MOST-like + LEAST-like
# Each descriptor maps to one of D, I, S, C.
# ---------------------------------------------------------------------------
DISC: List[Dict[str, Any]] = []

_DISC_GROUPS = [
    # (D, I, S, C)
    ("Assertive",     "Enthusiastic", "Patient",     "Precise"),
    ("Bold",          "Charming",     "Loyal",       "Analytical"),
    ("Competitive",   "Optimistic",   "Kind",        "Careful"),
    ("Direct",        "Persuasive",   "Steady",      "Detail-oriented"),
    ("Decisive",      "Sociable",     "Warm",        "Cautious"),
    ("Forceful",      "Talkative",    "Reliable",    "Perfectionist"),
    ("Driven",        "Playful",      "Even-tempered","Systematic"),
    ("Adventurous",   "Expressive",   "Supportive",  "Reserved"),
    ("Results-focused","Inspiring",   "Considerate", "Diplomatic"),
    ("Impatient",     "Impulsive",    "Passive",     "Critical"),
    ("Confident",     "Friendly",     "Accommodating","Logical"),
    ("Dominant",      "Influencing",  "Stable",      "Compliant"),
    ("Task-focused",  "People-focused","Team-focused","Fact-focused"),
    ("Blunt",         "Animated",     "Modest",      "Skeptical"),
    ("Independent",   "Convincing",   "Deliberate",  "Restrained"),
    ("Pioneering",    "Cheerful",     "Consistent",  "Formal"),
    ("Risk-taking",   "Trusting",     "Gentle",      "Neat"),
    ("Ambitious",     "Outgoing",     "Sincere",     "Correct"),
    ("Demanding",     "Popular",      "Cooperative", "Investigative"),
    ("Innovative",    "Emotional",    "Content",     "Judgmental"),
    ("Take-charge",   "Impressionable","Predictable","Refined"),
    ("Firm",          "Excited",      "Thoughtful",  "Serious"),
    ("Argumentative", "Talkative",    "Restrained",  "Rigid"),
    ("Self-reliant",  "Generous",     "Amiable",     "Structured"),
    ("Insistent",     "Spontaneous",  "Deliberate",  "Perfectionist"),
    ("Vigorous",      "Attractive",   "Peaceful",    "Cautious"),
    ("Determined",    "Life-of-party","Devoted",     "Meticulous"),
    ("Restless",      "Enthusiastic", "Reflective",  "Precise"),
]

for idx, group in enumerate(_DISC_GROUPS):
    d, i, s, c = group
    DISC.append({
        "assessment_type": "disc",
        "question_id": f"disc_group_{idx+1:02d}",
        "dimension": "disc",
        "question_text": "Pick the word MOST like you and the word LEAST like you.",
        "response_type": "disc_group",
        "options": [
            {"text": d, "letter": "D"},
            {"text": i, "letter": "I"},
            {"text": s, "letter": "S"},
            {"text": c, "letter": "C"},
        ],
    })

assert len(DISC) == 28, f"DISC expected 28, got {len(DISC)}"


# ---------------------------------------------------------------------------
# Unified access
# ---------------------------------------------------------------------------
ALL_BANKS = {
    "big_five":     BIG_FIVE,
    "mbti":         MBTI,
    "enneagram":    ENNEAGRAM,
    "via_strengths":VIA,
    "eq":           EQ,
    "disc":         DISC,
}

TOTAL_QUESTIONS = sum(len(v) for v in ALL_BANKS.values())
assert TOTAL_QUESTIONS == 414, f"Total expected 414, got {TOTAL_QUESTIONS}"


def get_bank(assessment_type: str) -> List[Dict[str, Any]]:
    return ALL_BANKS.get(assessment_type, [])


if __name__ == "__main__":
    for k, v in ALL_BANKS.items():
        print(f"{k}: {len(v)}")
    print(f"Total: {TOTAL_QUESTIONS}")
