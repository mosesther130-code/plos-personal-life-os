"""
Tests for Business Ideas Advisor + Shopping & Deals Engine modules.
Endpoints under /api/business/* and /api/shopping/*.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEST_EMAIL = "test1@plos.app"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Business Ideas ----------------
class TestBusinessIdeas:
    def test_list_seed_ideas(self, headers):
        # Reset any prior generated ideas so we get seed
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        cli[os.environ.get("DB_NAME", "test_database")].business_ideas.delete_many({})
        cli.close()

        r = requests.get(f"{API}/business/ideas", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_seed"] is True
        ideas = data["ideas"]
        assert len(ideas) == 3
        names = [i["business_name"] for i in ideas]
        assert "Educational Consulting & Assessment Services" in names
        assert "International Financial Management Consulting" in names
        assert "Eden Heights Sanctuary Resort" in names
        for i in ideas:
            assert i["is_seed"] is True
            for k in ("idea_id", "timeline_tag", "risk_level", "description",
                      "startup_cost_range", "estimated_monthly_revenue_range",
                      "time_to_first_revenue", "next_steps"):
                assert k in i, f"missing {k}"
            assert isinstance(i["next_steps"], list)

    def test_seed_plan_endpoint(self, headers):
        # Use seed id directly - may take 20-40s
        r = requests.post(f"{API}/business/ideas/seed-1/plan", headers=headers, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["idea_id"] == "seed-1"
        assert "plan" in data
        assert len(data["plan"]) > 200, "plan content too short"

    def test_generate_ideas_llm(self, headers):
        r = requests.post(f"{API}/business/ideas/generate", headers=headers, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        ideas = data["ideas"]
        assert 1 <= len(ideas) <= 5
        assert data["is_seed"] is False
        for i in ideas:
            for k in ("business_name", "timeline_tag", "risk_level", "description",
                      "startup_cost_range", "estimated_monthly_revenue_range",
                      "time_to_first_revenue", "next_steps"):
                assert k in i, f"missing {k} in generated idea"
            assert isinstance(i["next_steps"], list)

        # Verify they are persisted (NOT seed now)
        r2 = requests.get(f"{API}/business/ideas", headers=headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["is_seed"] is False


# ---------------- Eden Heights ----------------
class TestEdenHeights:
    def test_get_defaults(self, headers):
        # ensure fresh state
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        cli[os.environ.get("DB_NAME", "test_database")].eden_heights.delete_many({})
        cli.close()

        r = requests.get(f"{API}/business/eden-heights", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["size_hectares"] == 4.0
        assert data["current_value_usd"] == 12000
        assert "Bulacan" in data["location"]
        assert len(data["phases"]) == 3
        assert len(data["roi_series"]) >= 5
        assert len(data["checklist"]) == 8

    def test_update_eden(self, headers):
        r = requests.put(f"{API}/business/eden-heights",
                         headers=headers,
                         json={"municipality": "Sta. Maria", "current_value_usd": 15000},
                         timeout=15)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/business/eden-heights", headers=headers, timeout=15)
        d = r2.json()
        assert d["municipality"] == "Sta. Maria"
        assert d["current_value_usd"] == 15000
        # Ensure phases/checklist still present
        assert len(d["phases"]) == 3
        assert len(d["checklist"]) == 8


# ---------------- Shopping Deals ----------------
class TestShoppingDeals:
    def test_get_deals(self, headers):
        # ensure no dismissals
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        cli[os.environ.get("DB_NAME", "test_database")].dismissed_deals.delete_many({})
        cli.close()

        r = requests.get(f"{API}/shopping/deals", headers=headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["deals"]) == 5
        assert d["dismissed_count"] == 0
        # 45 + 20 + 25.95 + 40 + 0 = 130.95 -> ~130
        assert 125 <= d["total_savings_this_month"] <= 135

    def test_dismiss_deal(self, headers):
        r = requests.post(f"{API}/shopping/deals/d1/dismiss", headers=headers, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/shopping/deals", headers=headers, timeout=15)
        d = r2.json()
        ids = [x["deal_id"] for x in d["deals"]]
        assert "d1" not in ids
        assert d["dismissed_count"] == 1
        assert len(d["deals"]) == 4


# ---------------- Shopping Preferences ----------------
class TestShoppingPrefs:
    def test_get_default_prefs(self, headers):
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        cli[os.environ.get("DB_NAME", "test_database")].shopping_prefs.delete_many({})
        cli.close()

        r = requests.get(f"{API}/shopping/preferences", headers=headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["gas_threshold"] == 2.85
        assert "categories" in d

    def test_update_prefs(self, headers):
        r = requests.put(f"{API}/shopping/preferences", headers=headers,
                         json={"gas_threshold": 3.0}, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/shopping/preferences", headers=headers, timeout=15)
        assert r2.json()["gas_threshold"] == 3.0


# ---------------- Shopping Utilities ----------------
class TestShoppingUtilities:
    def test_list_utilities(self, headers):
        r = requests.get(f"{API}/shopping/utilities", headers=headers, timeout=15)
        assert r.status_code == 200
        utils = r.json()["utilities"]
        assert len(utils) == 4
        providers = [u["provider"] for u in utils]
        assert "Georgia Power" in providers
        assert "AT&T Wireless" in providers
        assert "AT&T Internet" in providers
        assert "DeKalb County Water" in providers

    def test_find_better_rate(self, headers):
        r = requests.post(f"{API}/shopping/utilities/ga_power/find-better",
                          headers=headers, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["utility_id"] == "ga_power"
        assert d["provider"] == "Georgia Power"
        assert len(d.get("recommendation", "")) > 100

    def test_find_better_not_found(self, headers):
        r = requests.post(f"{API}/shopping/utilities/nope/find-better",
                          headers=headers, timeout=15)
        assert r.status_code == 404


# ---------------- Registered Products ----------------
class TestRegisteredProducts:
    def test_initial_empty(self, headers):
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        cli[os.environ.get("DB_NAME", "test_database")].registered_products.delete_many({})
        cli.close()

        r = requests.get(f"{API}/shopping/registered-products", headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["products"] == []

    def test_register_and_delete(self, headers):
        r = requests.post(f"{API}/shopping/registered-products", headers=headers,
                         json={"name": "Toyota RAV4 2015", "brand": "Toyota",
                               "model": "RAV4 LE", "category": "auto"}, timeout=15)
        assert r.status_code == 200, r.text
        prod = r.json()
        assert "product_id" in prod
        assert prod["name"] == "Toyota RAV4 2015"
        pid = prod["product_id"]

        # GET shows it
        r2 = requests.get(f"{API}/shopping/registered-products", headers=headers, timeout=15)
        products = r2.json()["products"]
        assert any(p["product_id"] == pid for p in products)

        # DELETE
        r3 = requests.delete(f"{API}/shopping/registered-products/{pid}",
                             headers=headers, timeout=15)
        assert r3.status_code == 200

        r4 = requests.get(f"{API}/shopping/registered-products", headers=headers, timeout=15)
        assert all(p["product_id"] != pid for p in r4.json()["products"])

    def test_register_requires_name(self, headers):
        r = requests.post(f"{API}/shopping/registered-products", headers=headers,
                          json={"category": "auto"}, timeout=15)
        assert r.status_code == 400


# ---------------- Auth guards ----------------
class TestAuthGuards:
    def test_unauth(self):
        r = requests.get(f"{API}/business/ideas", timeout=15)
        assert r.status_code in (401, 403)

        r2 = requests.get(f"{API}/shopping/deals", timeout=15)
        assert r2.status_code in (401, 403)
