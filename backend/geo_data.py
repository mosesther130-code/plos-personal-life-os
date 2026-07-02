"""Comprehensive countries dataset + haversine helper for PLOS location system."""
from __future__ import annotations
import math
from typing import Any, Dict, List, Optional, Tuple

# Curated set of ~180 major world cities with coordinates, used for
# local fuzzy search when Google Places / Nominatim are unavailable.
MAJOR_CITIES: List[Dict[str, Any]] = [
    # United States
    {"name": "Atlanta", "admin1": "GA", "country_code": "US", "lat": 33.7490, "lng": -84.3880},
    {"name": "New York", "admin1": "NY", "country_code": "US", "lat": 40.7128, "lng": -74.0060},
    {"name": "Los Angeles", "admin1": "CA", "country_code": "US", "lat": 34.0522, "lng": -118.2437},
    {"name": "Chicago", "admin1": "IL", "country_code": "US", "lat": 41.8781, "lng": -87.6298},
    {"name": "Houston", "admin1": "TX", "country_code": "US", "lat": 29.7604, "lng": -95.3698},
    {"name": "Phoenix", "admin1": "AZ", "country_code": "US", "lat": 33.4484, "lng": -112.0740},
    {"name": "Philadelphia", "admin1": "PA", "country_code": "US", "lat": 39.9526, "lng": -75.1652},
    {"name": "San Antonio", "admin1": "TX", "country_code": "US", "lat": 29.4241, "lng": -98.4936},
    {"name": "San Diego", "admin1": "CA", "country_code": "US", "lat": 32.7157, "lng": -117.1611},
    {"name": "Dallas", "admin1": "TX", "country_code": "US", "lat": 32.7767, "lng": -96.7970},
    {"name": "San Jose", "admin1": "CA", "country_code": "US", "lat": 37.3382, "lng": -121.8863},
    {"name": "Austin", "admin1": "TX", "country_code": "US", "lat": 30.2672, "lng": -97.7431},
    {"name": "Jacksonville", "admin1": "FL", "country_code": "US", "lat": 30.3322, "lng": -81.6557},
    {"name": "San Francisco", "admin1": "CA", "country_code": "US", "lat": 37.7749, "lng": -122.4194},
    {"name": "Columbus", "admin1": "OH", "country_code": "US", "lat": 39.9612, "lng": -82.9988},
    {"name": "Charlotte", "admin1": "NC", "country_code": "US", "lat": 35.2271, "lng": -80.8431},
    {"name": "Indianapolis", "admin1": "IN", "country_code": "US", "lat": 39.7684, "lng": -86.1581},
    {"name": "Seattle", "admin1": "WA", "country_code": "US", "lat": 47.6062, "lng": -122.3321},
    {"name": "Denver", "admin1": "CO", "country_code": "US", "lat": 39.7392, "lng": -104.9903},
    {"name": "Boston", "admin1": "MA", "country_code": "US", "lat": 42.3601, "lng": -71.0589},
    {"name": "Washington", "admin1": "DC", "country_code": "US", "lat": 38.9072, "lng": -77.0369},
    {"name": "Miami", "admin1": "FL", "country_code": "US", "lat": 25.7617, "lng": -80.1918},
    {"name": "Portland", "admin1": "OR", "country_code": "US", "lat": 45.5152, "lng": -122.6784},
    {"name": "Detroit", "admin1": "MI", "country_code": "US", "lat": 42.3314, "lng": -83.0458},
    {"name": "Minneapolis", "admin1": "MN", "country_code": "US", "lat": 44.9778, "lng": -93.2650},
    {"name": "Nashville", "admin1": "TN", "country_code": "US", "lat": 36.1627, "lng": -86.7816},
    {"name": "Stone Mountain", "admin1": "GA", "country_code": "US", "lat": 33.8081, "lng": -84.1702},
    {"name": "Decatur", "admin1": "GA", "country_code": "US", "lat": 33.7748, "lng": -84.2963},
    {"name": "Marietta", "admin1": "GA", "country_code": "US", "lat": 33.9526, "lng": -84.5499},
    {"name": "Alpharetta", "admin1": "GA", "country_code": "US", "lat": 34.0754, "lng": -84.2941},
    {"name": "Savannah", "admin1": "GA", "country_code": "US", "lat": 32.0809, "lng": -81.0912},
    {"name": "Arlington", "admin1": "VA", "country_code": "US", "lat": 38.8816, "lng": -77.0910},
    {"name": "Alexandria", "admin1": "VA", "country_code": "US", "lat": 38.8048, "lng": -77.0469},
    # Canada
    {"name": "Toronto", "admin1": "ON", "country_code": "CA", "lat": 43.6532, "lng": -79.3832},
    {"name": "Vancouver", "admin1": "BC", "country_code": "CA", "lat": 49.2827, "lng": -123.1207},
    {"name": "Montreal", "admin1": "QC", "country_code": "CA", "lat": 45.5017, "lng": -73.5673},
    {"name": "Ottawa", "admin1": "ON", "country_code": "CA", "lat": 45.4215, "lng": -75.6972},
    # Mexico
    {"name": "Mexico City", "admin1": "CDMX", "country_code": "MX", "lat": 19.4326, "lng": -99.1332},
    {"name": "Guadalajara", "admin1": "JAL", "country_code": "MX", "lat": 20.6597, "lng": -103.3496},
    {"name": "Monterrey", "admin1": "NL", "country_code": "MX", "lat": 25.6866, "lng": -100.3161},
    # South America
    {"name": "Buenos Aires", "admin1": "", "country_code": "AR", "lat": -34.6037, "lng": -58.3816},
    {"name": "São Paulo", "admin1": "SP", "country_code": "BR", "lat": -23.5505, "lng": -46.6333},
    {"name": "Rio de Janeiro", "admin1": "RJ", "country_code": "BR", "lat": -22.9068, "lng": -43.1729},
    {"name": "Brasília", "admin1": "DF", "country_code": "BR", "lat": -15.7801, "lng": -47.9292},
    {"name": "Bogotá", "admin1": "", "country_code": "CO", "lat": 4.7110, "lng": -74.0721},
    {"name": "Lima", "admin1": "", "country_code": "PE", "lat": -12.0464, "lng": -77.0428},
    {"name": "Santiago", "admin1": "", "country_code": "CL", "lat": -33.4489, "lng": -70.6693},
    # Europe
    {"name": "London", "admin1": "England", "country_code": "GB", "lat": 51.5074, "lng": -0.1278},
    {"name": "Edinburgh", "admin1": "Scotland", "country_code": "GB", "lat": 55.9533, "lng": -3.1883},
    {"name": "Manchester", "admin1": "England", "country_code": "GB", "lat": 53.4808, "lng": -2.2426},
    {"name": "Dublin", "admin1": "", "country_code": "IE", "lat": 53.3498, "lng": -6.2603},
    {"name": "Paris", "admin1": "Île-de-France", "country_code": "FR", "lat": 48.8566, "lng": 2.3522},
    {"name": "Berlin", "admin1": "", "country_code": "DE", "lat": 52.5200, "lng": 13.4050},
    {"name": "Munich", "admin1": "Bavaria", "country_code": "DE", "lat": 48.1351, "lng": 11.5820},
    {"name": "Frankfurt", "admin1": "Hesse", "country_code": "DE", "lat": 50.1109, "lng": 8.6821},
    {"name": "Brussels", "admin1": "Brussels-Capital", "country_code": "BE", "lat": 50.8503, "lng": 4.3517},
    {"name": "Antwerp", "admin1": "", "country_code": "BE", "lat": 51.2194, "lng": 4.4025},
    {"name": "Amsterdam", "admin1": "", "country_code": "NL", "lat": 52.3676, "lng": 4.9041},
    {"name": "Zurich", "admin1": "", "country_code": "CH", "lat": 47.3769, "lng": 8.5417},
    {"name": "Geneva", "admin1": "", "country_code": "CH", "lat": 46.2044, "lng": 6.1432},
    {"name": "Vienna", "admin1": "", "country_code": "AT", "lat": 48.2082, "lng": 16.3738},
    {"name": "Rome", "admin1": "", "country_code": "IT", "lat": 41.9028, "lng": 12.4964},
    {"name": "Milan", "admin1": "", "country_code": "IT", "lat": 45.4642, "lng": 9.1900},
    {"name": "Madrid", "admin1": "", "country_code": "ES", "lat": 40.4168, "lng": -3.7038},
    {"name": "Barcelona", "admin1": "", "country_code": "ES", "lat": 41.3851, "lng": 2.1734},
    {"name": "Lisbon", "admin1": "", "country_code": "PT", "lat": 38.7223, "lng": -9.1393},
    {"name": "Copenhagen", "admin1": "", "country_code": "DK", "lat": 55.6761, "lng": 12.5683},
    {"name": "Stockholm", "admin1": "", "country_code": "SE", "lat": 59.3293, "lng": 18.0686},
    {"name": "Oslo", "admin1": "", "country_code": "NO", "lat": 59.9139, "lng": 10.7522},
    {"name": "Athens", "admin1": "", "country_code": "GR", "lat": 37.9838, "lng": 23.7275},
    {"name": "Warsaw", "admin1": "", "country_code": "PL", "lat": 52.2297, "lng": 21.0122},
    {"name": "Prague", "admin1": "", "country_code": "CZ", "lat": 50.0755, "lng": 14.4378},
    {"name": "Budapest", "admin1": "", "country_code": "HU", "lat": 47.4979, "lng": 19.0402},
    {"name": "Moscow", "admin1": "", "country_code": "RU", "lat": 55.7558, "lng": 37.6173},
    {"name": "Kyiv", "admin1": "", "country_code": "UA", "lat": 50.4501, "lng": 30.5234},
    {"name": "Istanbul", "admin1": "", "country_code": "TR", "lat": 41.0082, "lng": 28.9784},
    # Middle East
    {"name": "Dubai", "admin1": "", "country_code": "AE", "lat": 25.2048, "lng": 55.2708},
    {"name": "Abu Dhabi", "admin1": "", "country_code": "AE", "lat": 24.4539, "lng": 54.3773},
    {"name": "Riyadh", "admin1": "", "country_code": "SA", "lat": 24.7136, "lng": 46.6753},
    {"name": "Doha", "admin1": "", "country_code": "QA", "lat": 25.2854, "lng": 51.5310},
    {"name": "Amman", "admin1": "", "country_code": "JO", "lat": 31.9454, "lng": 35.9284},
    {"name": "Cairo", "admin1": "", "country_code": "EG", "lat": 30.0444, "lng": 31.2357},
    {"name": "Tel Aviv", "admin1": "", "country_code": "IL", "lat": 32.0853, "lng": 34.7818},
    {"name": "Casablanca", "admin1": "", "country_code": "MA", "lat": 33.5731, "lng": -7.5898},
    # Sub-Saharan Africa
    {"name": "Lagos", "admin1": "", "country_code": "NG", "lat": 6.5244, "lng": 3.3792},
    {"name": "Abuja", "admin1": "", "country_code": "NG", "lat": 9.0765, "lng": 7.3986},
    {"name": "Accra", "admin1": "", "country_code": "GH", "lat": 5.6037, "lng": -0.1870},
    {"name": "Nairobi", "admin1": "", "country_code": "KE", "lat": -1.2921, "lng": 36.8219},
    {"name": "Addis Ababa", "admin1": "", "country_code": "ET", "lat": 9.0300, "lng": 38.7400},
    {"name": "Kigali", "admin1": "", "country_code": "RW", "lat": -1.9441, "lng": 30.0619},
    {"name": "Johannesburg", "admin1": "", "country_code": "ZA", "lat": -26.2041, "lng": 28.0473},
    {"name": "Cape Town", "admin1": "", "country_code": "ZA", "lat": -33.9249, "lng": 18.4241},
    # South Asia
    {"name": "Mumbai", "admin1": "MH", "country_code": "IN", "lat": 19.0760, "lng": 72.8777},
    {"name": "New Delhi", "admin1": "DL", "country_code": "IN", "lat": 28.6139, "lng": 77.2090},
    {"name": "Bangalore", "admin1": "KA", "country_code": "IN", "lat": 12.9716, "lng": 77.5946},
    {"name": "Chennai", "admin1": "TN", "country_code": "IN", "lat": 13.0827, "lng": 80.2707},
    {"name": "Hyderabad", "admin1": "TG", "country_code": "IN", "lat": 17.3850, "lng": 78.4867},
    {"name": "Karachi", "admin1": "", "country_code": "PK", "lat": 24.8607, "lng": 67.0011},
    {"name": "Islamabad", "admin1": "", "country_code": "PK", "lat": 33.6844, "lng": 73.0479},
    {"name": "Dhaka", "admin1": "", "country_code": "BD", "lat": 23.8103, "lng": 90.4125},
    {"name": "Kathmandu", "admin1": "", "country_code": "NP", "lat": 27.7172, "lng": 85.3240},
    {"name": "Colombo", "admin1": "", "country_code": "LK", "lat": 6.9271, "lng": 79.8612},
    # Southeast Asia
    {"name": "Manila", "admin1": "NCR", "country_code": "PH", "lat": 14.5995, "lng": 120.9842},
    {"name": "Quezon City", "admin1": "NCR", "country_code": "PH", "lat": 14.6760, "lng": 121.0437},
    {"name": "Cebu City", "admin1": "", "country_code": "PH", "lat": 10.3157, "lng": 123.8854},
    {"name": "Davao City", "admin1": "", "country_code": "PH", "lat": 7.1907, "lng": 125.4553},
    {"name": "Bangkok", "admin1": "", "country_code": "TH", "lat": 13.7563, "lng": 100.5018},
    {"name": "Ho Chi Minh City", "admin1": "", "country_code": "VN", "lat": 10.8231, "lng": 106.6297},
    {"name": "Hanoi", "admin1": "", "country_code": "VN", "lat": 21.0285, "lng": 105.8542},
    {"name": "Jakarta", "admin1": "", "country_code": "ID", "lat": -6.2088, "lng": 106.8456},
    {"name": "Kuala Lumpur", "admin1": "", "country_code": "MY", "lat": 3.1390, "lng": 101.6869},
    {"name": "Singapore", "admin1": "", "country_code": "SG", "lat": 1.3521, "lng": 103.8198},
    # East Asia
    {"name": "Tokyo", "admin1": "", "country_code": "JP", "lat": 35.6762, "lng": 139.6503},
    {"name": "Osaka", "admin1": "", "country_code": "JP", "lat": 34.6937, "lng": 135.5023},
    {"name": "Seoul", "admin1": "", "country_code": "KR", "lat": 37.5665, "lng": 126.9780},
    {"name": "Beijing", "admin1": "", "country_code": "CN", "lat": 39.9042, "lng": 116.4074},
    {"name": "Shanghai", "admin1": "", "country_code": "CN", "lat": 31.2304, "lng": 121.4737},
    {"name": "Shenzhen", "admin1": "", "country_code": "CN", "lat": 22.5431, "lng": 114.0579},
    {"name": "Hong Kong", "admin1": "", "country_code": "HK", "lat": 22.3193, "lng": 114.1694},
    {"name": "Taipei", "admin1": "", "country_code": "TW", "lat": 25.0330, "lng": 121.5654},
    # Pacific
    {"name": "Sydney", "admin1": "NSW", "country_code": "AU", "lat": -33.8688, "lng": 151.2093},
    {"name": "Melbourne", "admin1": "VIC", "country_code": "AU", "lat": -37.8136, "lng": 144.9631},
    {"name": "Brisbane", "admin1": "QLD", "country_code": "AU", "lat": -27.4698, "lng": 153.0251},
    {"name": "Perth", "admin1": "WA", "country_code": "AU", "lat": -31.9505, "lng": 115.8605},
    {"name": "Canberra", "admin1": "ACT", "country_code": "AU", "lat": -35.2809, "lng": 149.1300},
    {"name": "Auckland", "admin1": "", "country_code": "NZ", "lat": -36.8485, "lng": 174.7633},
    {"name": "Wellington", "admin1": "", "country_code": "NZ", "lat": -41.2865, "lng": 174.7762},
]

# ISO-3166-1 alpha-2 code → (name, region_group)
# 13 regional groups as specified by owner.
COUNTRIES: List[Dict[str, str]] = [
    # North America
    {"code": "US", "name": "United States", "region": "north_america"},
    {"code": "CA", "name": "Canada", "region": "north_america"},
    {"code": "MX", "name": "Mexico", "region": "north_america"},

    # Central America & Caribbean
    {"code": "GT", "name": "Guatemala", "region": "central_america_caribbean"},
    {"code": "BZ", "name": "Belize", "region": "central_america_caribbean"},
    {"code": "SV", "name": "El Salvador", "region": "central_america_caribbean"},
    {"code": "HN", "name": "Honduras", "region": "central_america_caribbean"},
    {"code": "NI", "name": "Nicaragua", "region": "central_america_caribbean"},
    {"code": "CR", "name": "Costa Rica", "region": "central_america_caribbean"},
    {"code": "PA", "name": "Panama", "region": "central_america_caribbean"},
    {"code": "CU", "name": "Cuba", "region": "central_america_caribbean"},
    {"code": "JM", "name": "Jamaica", "region": "central_america_caribbean"},
    {"code": "HT", "name": "Haiti", "region": "central_america_caribbean"},
    {"code": "DO", "name": "Dominican Republic", "region": "central_america_caribbean"},
    {"code": "PR", "name": "Puerto Rico", "region": "central_america_caribbean"},
    {"code": "TT", "name": "Trinidad and Tobago", "region": "central_america_caribbean"},
    {"code": "BS", "name": "Bahamas", "region": "central_america_caribbean"},
    {"code": "BB", "name": "Barbados", "region": "central_america_caribbean"},

    # South America
    {"code": "AR", "name": "Argentina", "region": "south_america"},
    {"code": "BO", "name": "Bolivia", "region": "south_america"},
    {"code": "BR", "name": "Brazil", "region": "south_america"},
    {"code": "CL", "name": "Chile", "region": "south_america"},
    {"code": "CO", "name": "Colombia", "region": "south_america"},
    {"code": "EC", "name": "Ecuador", "region": "south_america"},
    {"code": "GY", "name": "Guyana", "region": "south_america"},
    {"code": "PY", "name": "Paraguay", "region": "south_america"},
    {"code": "PE", "name": "Peru", "region": "south_america"},
    {"code": "SR", "name": "Suriname", "region": "south_america"},
    {"code": "UY", "name": "Uruguay", "region": "south_america"},
    {"code": "VE", "name": "Venezuela", "region": "south_america"},

    # Western Europe
    {"code": "GB", "name": "United Kingdom", "region": "western_europe"},
    {"code": "IE", "name": "Ireland", "region": "western_europe"},
    {"code": "FR", "name": "France", "region": "western_europe"},
    {"code": "DE", "name": "Germany", "region": "western_europe"},
    {"code": "BE", "name": "Belgium", "region": "western_europe"},
    {"code": "NL", "name": "Netherlands", "region": "western_europe"},
    {"code": "LU", "name": "Luxembourg", "region": "western_europe"},
    {"code": "CH", "name": "Switzerland", "region": "western_europe"},
    {"code": "AT", "name": "Austria", "region": "western_europe"},
    {"code": "IT", "name": "Italy", "region": "western_europe"},
    {"code": "ES", "name": "Spain", "region": "western_europe"},
    {"code": "PT", "name": "Portugal", "region": "western_europe"},
    {"code": "DK", "name": "Denmark", "region": "western_europe"},
    {"code": "SE", "name": "Sweden", "region": "western_europe"},
    {"code": "NO", "name": "Norway", "region": "western_europe"},
    {"code": "FI", "name": "Finland", "region": "western_europe"},
    {"code": "IS", "name": "Iceland", "region": "western_europe"},
    {"code": "GR", "name": "Greece", "region": "western_europe"},
    {"code": "MT", "name": "Malta", "region": "western_europe"},
    {"code": "CY", "name": "Cyprus", "region": "western_europe"},

    # Eastern Europe
    {"code": "PL", "name": "Poland", "region": "eastern_europe"},
    {"code": "CZ", "name": "Czech Republic", "region": "eastern_europe"},
    {"code": "SK", "name": "Slovakia", "region": "eastern_europe"},
    {"code": "HU", "name": "Hungary", "region": "eastern_europe"},
    {"code": "RO", "name": "Romania", "region": "eastern_europe"},
    {"code": "BG", "name": "Bulgaria", "region": "eastern_europe"},
    {"code": "SI", "name": "Slovenia", "region": "eastern_europe"},
    {"code": "HR", "name": "Croatia", "region": "eastern_europe"},
    {"code": "BA", "name": "Bosnia and Herzegovina", "region": "eastern_europe"},
    {"code": "RS", "name": "Serbia", "region": "eastern_europe"},
    {"code": "ME", "name": "Montenegro", "region": "eastern_europe"},
    {"code": "MK", "name": "North Macedonia", "region": "eastern_europe"},
    {"code": "AL", "name": "Albania", "region": "eastern_europe"},
    {"code": "XK", "name": "Kosovo", "region": "eastern_europe"},
    {"code": "EE", "name": "Estonia", "region": "eastern_europe"},
    {"code": "LV", "name": "Latvia", "region": "eastern_europe"},
    {"code": "LT", "name": "Lithuania", "region": "eastern_europe"},
    {"code": "BY", "name": "Belarus", "region": "eastern_europe"},
    {"code": "UA", "name": "Ukraine", "region": "eastern_europe"},
    {"code": "MD", "name": "Moldova", "region": "eastern_europe"},
    {"code": "RU", "name": "Russia", "region": "eastern_europe"},

    # Middle East & North Africa
    {"code": "TR", "name": "Turkey", "region": "middle_east_north_africa"},
    {"code": "IL", "name": "Israel", "region": "middle_east_north_africa"},
    {"code": "PS", "name": "Palestine", "region": "middle_east_north_africa"},
    {"code": "JO", "name": "Jordan", "region": "middle_east_north_africa"},
    {"code": "LB", "name": "Lebanon", "region": "middle_east_north_africa"},
    {"code": "SY", "name": "Syria", "region": "middle_east_north_africa"},
    {"code": "IQ", "name": "Iraq", "region": "middle_east_north_africa"},
    {"code": "IR", "name": "Iran", "region": "middle_east_north_africa"},
    {"code": "SA", "name": "Saudi Arabia", "region": "middle_east_north_africa"},
    {"code": "YE", "name": "Yemen", "region": "middle_east_north_africa"},
    {"code": "OM", "name": "Oman", "region": "middle_east_north_africa"},
    {"code": "AE", "name": "United Arab Emirates", "region": "middle_east_north_africa"},
    {"code": "QA", "name": "Qatar", "region": "middle_east_north_africa"},
    {"code": "BH", "name": "Bahrain", "region": "middle_east_north_africa"},
    {"code": "KW", "name": "Kuwait", "region": "middle_east_north_africa"},
    {"code": "EG", "name": "Egypt", "region": "middle_east_north_africa"},
    {"code": "LY", "name": "Libya", "region": "middle_east_north_africa"},
    {"code": "TN", "name": "Tunisia", "region": "middle_east_north_africa"},
    {"code": "DZ", "name": "Algeria", "region": "middle_east_north_africa"},
    {"code": "MA", "name": "Morocco", "region": "middle_east_north_africa"},
    {"code": "SD", "name": "Sudan", "region": "middle_east_north_africa"},

    # Sub-Saharan Africa
    {"code": "NG", "name": "Nigeria", "region": "sub_saharan_africa"},
    {"code": "GH", "name": "Ghana", "region": "sub_saharan_africa"},
    {"code": "CI", "name": "Côte d'Ivoire", "region": "sub_saharan_africa"},
    {"code": "SN", "name": "Senegal", "region": "sub_saharan_africa"},
    {"code": "ML", "name": "Mali", "region": "sub_saharan_africa"},
    {"code": "BF", "name": "Burkina Faso", "region": "sub_saharan_africa"},
    {"code": "NE", "name": "Niger", "region": "sub_saharan_africa"},
    {"code": "TD", "name": "Chad", "region": "sub_saharan_africa"},
    {"code": "CM", "name": "Cameroon", "region": "sub_saharan_africa"},
    {"code": "CF", "name": "Central African Republic", "region": "sub_saharan_africa"},
    {"code": "CG", "name": "Republic of the Congo", "region": "sub_saharan_africa"},
    {"code": "CD", "name": "DR Congo", "region": "sub_saharan_africa"},
    {"code": "GA", "name": "Gabon", "region": "sub_saharan_africa"},
    {"code": "GQ", "name": "Equatorial Guinea", "region": "sub_saharan_africa"},
    {"code": "AO", "name": "Angola", "region": "sub_saharan_africa"},
    {"code": "ZM", "name": "Zambia", "region": "sub_saharan_africa"},
    {"code": "ZW", "name": "Zimbabwe", "region": "sub_saharan_africa"},
    {"code": "MZ", "name": "Mozambique", "region": "sub_saharan_africa"},
    {"code": "MW", "name": "Malawi", "region": "sub_saharan_africa"},
    {"code": "MG", "name": "Madagascar", "region": "sub_saharan_africa"},
    {"code": "MU", "name": "Mauritius", "region": "sub_saharan_africa"},
    {"code": "KE", "name": "Kenya", "region": "sub_saharan_africa"},
    {"code": "UG", "name": "Uganda", "region": "sub_saharan_africa"},
    {"code": "TZ", "name": "Tanzania", "region": "sub_saharan_africa"},
    {"code": "RW", "name": "Rwanda", "region": "sub_saharan_africa"},
    {"code": "BI", "name": "Burundi", "region": "sub_saharan_africa"},
    {"code": "SS", "name": "South Sudan", "region": "sub_saharan_africa"},
    {"code": "ET", "name": "Ethiopia", "region": "sub_saharan_africa"},
    {"code": "ER", "name": "Eritrea", "region": "sub_saharan_africa"},
    {"code": "DJ", "name": "Djibouti", "region": "sub_saharan_africa"},
    {"code": "SO", "name": "Somalia", "region": "sub_saharan_africa"},
    {"code": "ZA", "name": "South Africa", "region": "sub_saharan_africa"},
    {"code": "NA", "name": "Namibia", "region": "sub_saharan_africa"},
    {"code": "BW", "name": "Botswana", "region": "sub_saharan_africa"},
    {"code": "LS", "name": "Lesotho", "region": "sub_saharan_africa"},
    {"code": "SZ", "name": "Eswatini", "region": "sub_saharan_africa"},
    {"code": "LR", "name": "Liberia", "region": "sub_saharan_africa"},
    {"code": "SL", "name": "Sierra Leone", "region": "sub_saharan_africa"},
    {"code": "GN", "name": "Guinea", "region": "sub_saharan_africa"},
    {"code": "GW", "name": "Guinea-Bissau", "region": "sub_saharan_africa"},
    {"code": "GM", "name": "Gambia", "region": "sub_saharan_africa"},
    {"code": "CV", "name": "Cape Verde", "region": "sub_saharan_africa"},
    {"code": "TG", "name": "Togo", "region": "sub_saharan_africa"},
    {"code": "BJ", "name": "Benin", "region": "sub_saharan_africa"},

    # South Asia
    {"code": "IN", "name": "India", "region": "south_asia"},
    {"code": "PK", "name": "Pakistan", "region": "south_asia"},
    {"code": "BD", "name": "Bangladesh", "region": "south_asia"},
    {"code": "LK", "name": "Sri Lanka", "region": "south_asia"},
    {"code": "NP", "name": "Nepal", "region": "south_asia"},
    {"code": "BT", "name": "Bhutan", "region": "south_asia"},
    {"code": "MV", "name": "Maldives", "region": "south_asia"},
    {"code": "AF", "name": "Afghanistan", "region": "south_asia"},

    # Southeast Asia
    {"code": "PH", "name": "Philippines", "region": "southeast_asia"},
    {"code": "TH", "name": "Thailand", "region": "southeast_asia"},
    {"code": "VN", "name": "Vietnam", "region": "southeast_asia"},
    {"code": "ID", "name": "Indonesia", "region": "southeast_asia"},
    {"code": "MY", "name": "Malaysia", "region": "southeast_asia"},
    {"code": "SG", "name": "Singapore", "region": "southeast_asia"},
    {"code": "MM", "name": "Myanmar", "region": "southeast_asia"},
    {"code": "KH", "name": "Cambodia", "region": "southeast_asia"},
    {"code": "LA", "name": "Laos", "region": "southeast_asia"},
    {"code": "BN", "name": "Brunei", "region": "southeast_asia"},
    {"code": "TL", "name": "Timor-Leste", "region": "southeast_asia"},

    # East Asia
    {"code": "JP", "name": "Japan", "region": "east_asia"},
    {"code": "KR", "name": "South Korea", "region": "east_asia"},
    {"code": "KP", "name": "North Korea", "region": "east_asia"},
    {"code": "CN", "name": "China", "region": "east_asia"},
    {"code": "TW", "name": "Taiwan", "region": "east_asia"},
    {"code": "HK", "name": "Hong Kong", "region": "east_asia"},
    {"code": "MO", "name": "Macao", "region": "east_asia"},
    {"code": "MN", "name": "Mongolia", "region": "east_asia"},

    # Central Asia
    {"code": "KZ", "name": "Kazakhstan", "region": "central_asia"},
    {"code": "KG", "name": "Kyrgyzstan", "region": "central_asia"},
    {"code": "TJ", "name": "Tajikistan", "region": "central_asia"},
    {"code": "TM", "name": "Turkmenistan", "region": "central_asia"},
    {"code": "UZ", "name": "Uzbekistan", "region": "central_asia"},
    {"code": "AM", "name": "Armenia", "region": "central_asia"},
    {"code": "AZ", "name": "Azerbaijan", "region": "central_asia"},
    {"code": "GE", "name": "Georgia (country)", "region": "central_asia"},

    # Pacific & Oceania
    {"code": "AU", "name": "Australia", "region": "pacific_oceania"},
    {"code": "NZ", "name": "New Zealand", "region": "pacific_oceania"},
    {"code": "FJ", "name": "Fiji", "region": "pacific_oceania"},
    {"code": "PG", "name": "Papua New Guinea", "region": "pacific_oceania"},
    {"code": "SB", "name": "Solomon Islands", "region": "pacific_oceania"},
    {"code": "VU", "name": "Vanuatu", "region": "pacific_oceania"},
    {"code": "NC", "name": "New Caledonia", "region": "pacific_oceania"},
    {"code": "PF", "name": "French Polynesia", "region": "pacific_oceania"},
    {"code": "WS", "name": "Samoa", "region": "pacific_oceania"},
    {"code": "TO", "name": "Tonga", "region": "pacific_oceania"},
    {"code": "KI", "name": "Kiribati", "region": "pacific_oceania"},
    {"code": "TV", "name": "Tuvalu", "region": "pacific_oceania"},
    {"code": "NR", "name": "Nauru", "region": "pacific_oceania"},
    {"code": "PW", "name": "Palau", "region": "pacific_oceania"},
    {"code": "FM", "name": "Micronesia", "region": "pacific_oceania"},
    {"code": "MH", "name": "Marshall Islands", "region": "pacific_oceania"},
]

REGION_LABELS: Dict[str, str] = {
    "north_america": "North America",
    "central_america_caribbean": "Central America & Caribbean",
    "south_america": "South America",
    "western_europe": "Western Europe",
    "eastern_europe": "Eastern Europe",
    "middle_east_north_africa": "Middle East & North Africa",
    "sub_saharan_africa": "Sub-Saharan Africa",
    "south_asia": "South Asia",
    "southeast_asia": "Southeast Asia",
    "east_asia": "East Asia",
    "central_asia": "Central Asia",
    "pacific_oceania": "Pacific & Oceania",
}

# Region display order
REGION_ORDER: List[str] = [
    "north_america", "central_america_caribbean", "south_america",
    "western_europe", "eastern_europe", "middle_east_north_africa",
    "sub_saharan_africa", "south_asia", "southeast_asia", "east_asia",
    "central_asia", "pacific_oceania",
]

# US State abbreviations for region-quick heuristics
US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
}

# Southeast US quick region
SOUTHEAST_US_STATES = {"GA", "FL", "AL", "TN", "SC", "NC"}


def region_of(country_code: str) -> Optional[str]:
    for c in COUNTRIES:
        if c["code"] == country_code:
            return c["region"]
    return None


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in miles."""
    R = 3958.7613
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def group_countries() -> Dict[str, List[Dict[str, str]]]:
    """Return countries grouped by region, sorted alphabetically inside each."""
    out: Dict[str, List[Dict[str, str]]] = {r: [] for r in REGION_ORDER}
    for c in COUNTRIES:
        out.setdefault(c["region"], []).append(c)
    for r in out:
        out[r].sort(key=lambda x: x["name"])
    return out



def local_fuzzy_search(query: str, limit: int = 12) -> List[Dict[str, Any]]:
    """Best-effort location search over local datasets (countries + US
    states + curated major cities + US zip patterns).  Used as fallback
    when Google Places / Nominatim are unavailable."""
    q = (query or "").strip()
    if not q:
        return []
    ql = q.lower()
    out: List[Dict[str, Any]] = []
    seen_labels: set = set()

    def add(entry: Dict[str, Any]):
        key = (entry["main_text"] + "|" + entry.get("secondary_text", "")).lower()
        if key in seen_labels:
            return
        seen_labels.add(key)
        out.append(entry)

    # ZIP code pattern (US 3-5 digit)
    if q.isdigit() and 3 <= len(q) <= 5:
        add({
            "place_id": f"local:zip:{q}",
            "text": f"ZIP {q}, USA", "main_text": f"ZIP {q}",
            "secondary_text": "United States", "types": ["postal_code"],
            "entry_type": "zip", "source": "local",
            "country_code": "US", "country_name": "United States",
            "admin1": "", "city": "", "zip": q,
            "lat": 0.0, "lng": 0.0,
        })

    # Countries
    for c in COUNTRIES:
        name = c["name"]
        if ql in name.lower() or name.lower().startswith(ql):
            add({
                "place_id": f"local:country:{c['code']}",
                "text": name, "main_text": name,
                "secondary_text": REGION_LABELS.get(c["region"], "") or "Country",
                "types": ["country"], "entry_type": "country", "source": "local",
                "country_code": c["code"], "country_name": name,
                "admin1": "", "city": "", "zip": "", "lat": 0.0, "lng": 0.0,
            })
            if len(out) >= limit:
                return out

    # US states
    for code, sname in US_STATES.items():
        if ql in sname.lower() or ql == code.lower() or sname.lower().startswith(ql):
            add({
                "place_id": f"local:state:US:{code}",
                "text": f"{sname}, USA", "main_text": sname,
                "secondary_text": "United States",
                "types": ["administrative_area_level_1"],
                "entry_type": "state", "source": "local",
                "country_code": "US", "country_name": "United States",
                "admin1": code, "city": "", "zip": "",
                "lat": 0.0, "lng": 0.0,
            })
            if len(out) >= limit:
                return out

    # Major cities
    for city in MAJOR_CITIES:
        name = city["name"]
        cc = city["country_code"]
        a1 = city.get("admin1", "")
        haystack = f"{name} {a1} {cc}".lower()
        if ql in haystack or name.lower().startswith(ql):
            cname = ""
            for c_row in COUNTRIES:
                if c_row["code"] == cc:
                    cname = c_row["name"]
                    break
            sec_parts = [p for p in (a1, cname or cc) if p]
            add({
                "place_id": f"local:city:{cc}:{a1}:{name}",
                "text": f"{name}, {', '.join(sec_parts)}",
                "main_text": name,
                "secondary_text": ", ".join(sec_parts),
                "types": ["locality"], "entry_type": "city", "source": "local",
                "country_code": cc, "country_name": cname,
                "admin1": a1, "city": name, "zip": "",
                "lat": city["lat"], "lng": city["lng"],
            })
            if len(out) >= limit:
                return out
    return out
