"""
PLOS — Country context helper for locale-aware AI responses.
Mirror of frontend `country-context.ts`. Used by Legal Advisor and
Shopping & Deals endpoints to produce country-specific advice.

Structure:
- COUNTRY_MAP (below): hand-curated detailed info for the 8 primary markets.
- iso_countries.ISO_COUNTRIES: full ISO 3166-1 list (~195 countries) used as
  a fallback and for the searchable typeahead in the frontend.
"""
from __future__ import annotations
from typing import Dict, Optional

from iso_countries import ISO_COUNTRIES, iso_country

COUNTRY_MAP: Dict[str, Dict[str, str]] = {
    "US": {
        "name": "United States",
        "flag": "🇺🇸",
        "jurisdiction": "US federal law and applicable state laws (default reference: Georgia state law)",
        "currency": "USD",
        "currency_symbol": "$",
        "retailers": "Amazon, Walmart, Target, Best Buy, Costco, Sam's Club, Home Depot, Lowe's, B&H, Newegg, Wayfair, eBay, Kroger, Publix",
        "regulator": "FTC, CFPB, State Attorney General",
        "consumer_law_ref": "FTC Act, Magnuson-Moss Warranty Act, state consumer protection acts",
        "notes": "Prices in USD. Cite US-based retailers, service providers, and regulatory bodies (FTC, CFPB, state AG).",
    },
    "PH": {
        "name": "Philippines",
        "flag": "🇵🇭",
        "jurisdiction": "Philippine civil law (Republic Acts, Civil Code)",
        "currency": "PHP",
        "currency_symbol": "₱",
        "retailers": "Lazada, Shopee, SM Store, Robinsons, Puregold, Ayala Malls, Metro Gaisano",
        "regulator": "Department of Trade and Industry (DTI), Bangko Sentral ng Pilipinas (BSP)",
        "consumer_law_ref": "Republic Act 7394 (Consumer Act of the Philippines), RA 10173 (Data Privacy Act)",
        "notes": "Prices in PHP (₱). Cite Philippine retailers and Philippine regulatory bodies (DTI, BSP, LTFRB, etc.).",
    },
    "BE": {
        "name": "Belgium",
        "flag": "🇧🇪",
        "jurisdiction": "Belgian civil law and EU regulations (GDPR, Consumer Rights Directive)",
        "currency": "EUR",
        "currency_symbol": "€",
        "retailers": "Colruyt, Delhaize, Carrefour Belgium, Bol.com, Coolblue, MediaMarkt, Vanden Borre, Krëfel",
        "regulator": "SPF Economie (FOD Economie), Belgian Data Protection Authority (APD/GBA)",
        "consumer_law_ref": "Code de droit économique / Wetboek van economisch recht, EU Directive 2011/83/EU",
        "notes": "Prices in EUR (€). Cite Belgian and EU retailers and regulators (SPF Economie, EU Consumer Centre).",
    },
    "GB": {
        "name": "United Kingdom",
        "flag": "🇬🇧",
        "jurisdiction": "English common law (Consumer Rights Act 2015)",
        "currency": "GBP",
        "currency_symbol": "£",
        "retailers": "Amazon UK, Argos, John Lewis, Currys, Tesco, Sainsbury's, ASDA, Very, AO.com",
        "regulator": "Trading Standards, Competition and Markets Authority (CMA), Financial Conduct Authority (FCA)",
        "consumer_law_ref": "Consumer Rights Act 2015, Consumer Contracts Regulations 2013",
        "notes": "Prices in GBP (£). Cite UK retailers and UK regulators (CMA, Trading Standards, FCA).",
    },
    "CA": {
        "name": "Canada",
        "flag": "🇨🇦",
        "jurisdiction": "Canadian federal and provincial law",
        "currency": "CAD",
        "currency_symbol": "C$",
        "retailers": "Amazon.ca, Walmart Canada, Costco Canada, Canadian Tire, Best Buy Canada, Loblaws, Metro, Sobeys, The Bay",
        "regulator": "Competition Bureau, Office of Consumer Affairs, provincial consumer protection offices",
        "consumer_law_ref": "Competition Act, provincial Consumer Protection Acts",
        "notes": "Prices in CAD (C$). Cite Canadian retailers and regulators (Competition Bureau, provincial CPAs).",
    },
    "AU": {
        "name": "Australia",
        "flag": "🇦🇺",
        "jurisdiction": "Australian federal and state law (Australian Consumer Law)",
        "currency": "AUD",
        "currency_symbol": "A$",
        "retailers": "Amazon AU, Bunnings, Woolworths, Coles, JB Hi-Fi, Harvey Norman, Kmart Australia, Big W, Officeworks",
        "regulator": "Australian Competition and Consumer Commission (ACCC), state Fair Trading offices",
        "consumer_law_ref": "Australian Consumer Law (Competition and Consumer Act 2010, Schedule 2)",
        "notes": "Prices in AUD (A$). Cite Australian retailers and ACCC as regulator.",
    },
    "DE": {
        "name": "Germany",
        "flag": "🇩🇪",
        "jurisdiction": "German civil law (BGB) and EU regulations",
        "currency": "EUR",
        "currency_symbol": "€",
        "retailers": "Amazon.de, MediaMarkt, Saturn, Otto, Lidl, Aldi, Rewe, Edeka, Kaufland",
        "regulator": "Bundesnetzagentur, Bundeskartellamt, Verbraucherzentrale",
        "consumer_law_ref": "Bürgerliches Gesetzbuch (BGB) §§ 312-361, EU Directive 2011/83/EU",
        "notes": "Prices in EUR (€). Cite German retailers and regulators (Verbraucherzentrale, Bundesnetzagentur).",
    },
    "FR": {
        "name": "France",
        "flag": "🇫🇷",
        "jurisdiction": "French civil code and EU regulations",
        "currency": "EUR",
        "currency_symbol": "€",
        "retailers": "Amazon.fr, Fnac, Darty, Cdiscount, Carrefour, Leclerc, Auchan, Boulanger, Casino",
        "regulator": "DGCCRF (Direction générale de la concurrence, de la consommation et de la répression des fraudes)",
        "consumer_law_ref": "Code de la consommation, EU Directive 2011/83/EU",
        "notes": "Prices in EUR (€). Cite French retailers and DGCCRF as regulator.",
    },
}

DEFAULT_COUNTRY = "US"


def _generic_country_info(code: str) -> Dict[str, str]:
    """Fallback for any ISO country not in COUNTRY_MAP (still gets solid AI localisation)."""
    iso = iso_country(code)
    name = iso["name"]
    return {
        "name": name,
        "flag": iso["flag"],
        "jurisdiction": f"the national laws and regulations of {name}",
        "currency": iso["currency"],
        "currency_symbol": iso["symbol"],
        "retailers": f"the leading national and online retailers operating in {name}",
        "regulator": f"the primary consumer-protection and financial regulators of {name}",
        "consumer_law_ref": f"the consumer-protection statutes and civil code of {name}",
        "notes": (
            f"Prices in {iso['currency']} ({iso['symbol']}). Cite retailers, banks, telcos, "
            f"government agencies, and courts that actually operate in {name}. "
            f"If a specific statute is uncertain, describe the *type* of law that applies "
            f"in {name} (e.g. its consumer-protection code, labour code, family code) rather "
            f"than inventing article numbers."
        ),
    }


def get_country(code: Optional[str]) -> Dict[str, str]:
    """Return the country info block. Uses hand-curated map when available,
    otherwise generates a solid generic profile from the ISO list."""
    if not code:
        return COUNTRY_MAP[DEFAULT_COUNTRY]
    c = code.strip().upper()
    if c in COUNTRY_MAP:
        return COUNTRY_MAP[c]
    if c in ISO_COUNTRIES:
        return _generic_country_info(c)
    return COUNTRY_MAP[DEFAULT_COUNTRY]


def country_prompt_block(code: Optional[str]) -> str:
    """
    Returns a system-prompt fragment that tightly localises AI output to the
    selected country. Injected into legal / shopping / deal-finder prompts.
    """
    c = get_country(code)
    return (
        f"USER COUNTRY CONTEXT — {c['flag']} {c['name']} ({code or DEFAULT_COUNTRY}).\n"
        f"- Jurisdiction: {c['jurisdiction']}\n"
        f"- Currency: {c['currency']} ({c['currency_symbol']})\n"
        f"- Applicable consumer/legal framework: {c['consumer_law_ref']}\n"
        f"- Regulator(s): {c['regulator']}\n"
        f"- Preferred retailers/providers: {c['retailers']}\n"
        f"- LOCALISATION RULES: {c['notes']}\n"
        f"MANDATORY: All monetary values MUST be expressed in {c['currency']} using the {c['currency_symbol']} symbol. "
        f"All laws, statutes, and rights cited MUST be from {c['name']}. Do NOT reference US laws unless the user is in the US. "
        f"Retailers, service providers, and government agencies MUST be those that operate in {c['name']}."
    )
