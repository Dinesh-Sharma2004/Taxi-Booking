from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from geopy.distance import geodesic
from dotenv import load_dotenv
import httpx
import os
import uuid
from typing import Dict, List
import datetime
import random

# ---------------------------------------------
# Load environment variables from .env
# ---------------------------------------------
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
if not GOOGLE_API_KEY:
    print("❌ ERROR: GOOGLE_MAPS_API_KEY missing in .env")

# ---------------------------------------------
# FastAPI App
# ---------------------------------------------
app = FastAPI(title="Taxi Booking — Quote/Confirm API")

# This is CRITICAL for the HTML file to talk to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows all origins (e.g., file://, localhost)
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------
# Taxis in-memory DB & Constants
# ---------------------------------------------
# This is our 'real' fleet, which has persistent state
TAXIS: Dict[str, Dict] = {
    "T1": {"id": "T1", "lat": 28.61, "lng": 77.20, "available": True},
    "T2": {"id": "T2", "lat": 28.62, "lng": 77.21, "available": True},
    "T3": {"id": "T3", "lat": 28.65, "lng": 77.18, "available": True},
    "T4": {"id": "T4", "lat": 28.60, "lng": 77.25, "available": True},
}
BOOKINGS = {}

# Fee Constants
CANCEL_BASE_FEE = 25.0
CANCEL_PER_KM_RATE = 5.0    # Fee per km driver *actually* traveled
CANCEL_PER_MIN_RATE = 0.5    # Fee per minute user made the driver wait
# ----------------------------------------------------

# ---------------------------------------------
# Utility: Geocode using Google API
# ---------------------------------------------
async def geocode(address: str):
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"address": address, "key": GOOGLE_API_KEY}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params=params)
    data = r.json()
    if data.get("status") != "OK" or not data.get("results"):
        print(f"❌ Geocode Error: {data.get('status')}. Response: {data}")
        raise HTTPException(400, f"❌ Location not found: '{address}'")
    loc = data["results"][0]["geometry"]["location"]
    return loc["lat"], loc["lng"]

# ---------------------------------------------
# Utility: Distance + ETA using Distance Matrix API
# ---------------------------------------------
async def get_distance_eta(lat1, lng1, lat2, lng2):
    url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    params = {
        "origins": f"{lat1},{lng1}",
        "destinations": f"{lat2},{lng2}",
        "mode": "driving",
        "key": GOOGLE_API_KEY
    }
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params=params)
    data = r.json()
    try:
        element = data["rows"][0]["elements"][0]
    except (IndexError, KeyError):
        print(f"❌ Distance Matrix Error: Unexpected response. Response: {data}")
        raise HTTPException(400, "❌ Failed to fetch distance/ETA. Invalid response from API.")
    if element["status"] != "OK":
        print(f"❌ Distance Matrix Error: {element['status']}. Response: {data}")
        raise HTTPException(400, "❌ Failed to fetch distance/ETA")
    return element["distance"]["value"], element["duration"]["value"]

# ---------------------------------------------
# Utility: Weather-based surge
# ---------------------------------------------
async def get_weather(lat, lng):
    url = "https://weather.googleapis.com/v1/currentConditions:lookup"
    params = {
        "key": GOOGLE_API_KEY,
        "location.latitude": lat,
        "location.longitude": lng
    }
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params=params)
    try:
        data = r.json()
        condition_text = data["currentConditions"]["weatherCondition"]["text"]
        return condition_text
    except Exception as e:
        print(f"❌ Google Weather API Error: {e}. Response: {r.text}")
        return "Clear"

def surge_multiplier(weather: str):
    w = weather.lower()
    if "thunder" in w or "storm" in w or "blizzard" in w: return 1.5
    if "rain" in w or "sleet" in w or "pellets" in w: return 1.25
    if "snow" in w: return 1.3
    if "cloud" in w or "overcast" in w or "mist" in w or "fog" in w: return 1.1
    return 1.0

# ---------------------------------------------
# Utility: Taxi Simulation & Finding
# ---------------------------------------------
def generate_simulated_taxis(base_lat, base_lng, count=10) -> List[Dict]:
    """Generates a list of simulated taxis near a central point (Delhi)."""
    simulated_taxis = []
    for i in range(count):
        offset_lat = random.uniform(-0.1, 0.1) # ~11km radius
        offset_lng = random.uniform(-0.1, 0.1)
        
        simulated_taxis.append({
            "id": f"S{i+1}", # 'S' for Simulated
            "lat": base_lat + offset_lat,
            "lng": base_lng + offset_lng,
            "available": True # Simulated taxis are always available
        })
    return simulated_taxis

def _get_all_taxis_list() -> List[Dict]:
    """Helper to get all real taxis and generate simulated ones."""
    real_taxis = list(TAXIS.values())
    
    # Use a fixed center for simulation (Delhi)
    center_lat = 28.6139
    center_lng = 77.2090
    
    sim_taxis = generate_simulated_taxis(center_lat, center_lng, count=10)
    return real_taxis + sim_taxis

def find_nearest_taxi(pickup_lat, pickup_lng, taxi_list: List[Dict]):
    best = None
    best_dist = 9999
    
    for t in taxi_list:
        if not t.get("available", True):
            continue
            
        d = geodesic((pickup_lat, pickup_lng), (t["lat"], t["lng"])).km
        if d < best_dist:
            best_dist = d
            best = t
            
    return best

# ---------------------------------------------
# NEW ENDPOINT: GET ESTIMATE/QUOTE (NO BOOKING)
# ---------------------------------------------
@app.post("/booking/estimate")
async def booking_estimate(pickup: str, drop: str):
    # 1. Geocode
    pick_lat, pick_lng = await geocode(pickup)
    drop_lat, drop_lng = await geocode(drop)
    
    # 2. Find Taxi
    all_taxis_list = _get_all_taxis_list()
    taxi = find_nearest_taxi(pick_lat, pick_lng, all_taxis_list)
    
    if not taxi:
        raise HTTPException(400, "❌ No taxis available for estimate")

    # 3. Get taxi's route to pickup location
    try:
        taxi_dist_m, taxi_dur_s = await get_distance_eta(
            taxi["lat"], taxi["lng"], pick_lat, pick_lng
        )
        taxi_eta_min = max(1, int(taxi_dur_s / 60))
        taxi_distance_km = round(taxi_dist_m / 1000, 2)
    except:
        taxi_eta_min = 5 
        taxi_distance_km = 3.0
    
    # 4. Get main trip Distance/ETA (Pickup -> Drop)
    dist_m, dur_s = await get_distance_eta(pick_lat, pick_lng, drop_lat, drop_lng)
    distance_km = round(dist_m / 1000, 2)
    eta_min = max(1, int(dur_s / 60))
    
    # 5. Weather
    weather = await get_weather(pick_lat, pick_lng)
    multiplier = surge_multiplier(weather)
    
    # 6. Fare
    base = 50
    per_km = 12
    fare = round((base + distance_km * per_km) * multiplier, 2)
    
    # 7. Return Quote (No booking saved, taxi not locked)
    return {
        "id": str(uuid.uuid4()), # Temporary quote ID
        "taxi": taxi["id"],
        "pickup": pickup,
        "drop": drop,
        "distance_km": distance_km,
        "eta_min": eta_min,
        "weather": weather,
        "fare": fare,
        
        "pickup_lat": pick_lat,
        "pickup_lng": pick_lng,
        "drop_lat": drop_lat,
        "drop_lng": drop_lng,
        "taxi_start_lat": taxi["lat"],
        "taxi_start_lng": taxi["lng"],
        "taxi_eta_min": taxi_eta_min,
        "taxi_distance_km": taxi_distance_km
    }

# ---------------------------------------------
# NEW ENDPOINT: CONFIRM BOOKING
# ---------------------------------------------
@app.post("/booking/confirm")
async def booking_confirm(quote: Dict):
    taxi_id = quote["taxi"]
    
    # 1. Lock Taxi (if it's a real one)
    if taxi_id.startswith("T"):
        if TAXIS[taxi_id]["available"] is False:
             raise HTTPException(400, "❌ Taxi just became unavailable. Please re-quote.")
        TAXIS[taxi_id]["available"] = False 
    
    # 2. Save Booking
    bid = str(uuid.uuid4()) # Use a new definitive ID
    BOOKINGS[bid] = {
        **quote, # Copy all quote details
        "id": bid,
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    return BOOKINGS[bid]

# ---------------------------------------------
# CANCELLATION FEE HELPER (Unchanged)
# ---------------------------------------------
def _calculate_cancellation_fee(booking: Dict, time_elapsed_seconds: int) -> float:
    time_elapsed_min = time_elapsed_seconds / 60.0
    taxi_total_dist_km = booking.get("taxi_distance_km", 0) 
    taxi_total_eta_min = booking.get("taxi_eta_min", 1)
    taxi_total_eta_sec = taxi_total_eta_min * 60.0

    progress = min(1.0, time_elapsed_seconds / taxi_total_eta_sec)
    distance_traveled_km = taxi_total_dist_km * progress
    
    weather = booking.get("weather", "Clear")

    fee = CANCEL_BASE_FEE
    fee += (time_elapsed_min * CANCEL_PER_MIN_RATE)
    fee += (distance_traveled_km * CANCEL_PER_KM_RATE)
    
    multiplier = surge_multiplier(weather)
    total_fee = round(fee * multiplier, 2)
    
    return total_fee

# ---------------------------------------------
# CANCELLATION ENDPOINTS (Unchanged)
# ---------------------------------------------
@app.get("/booking/estimate_cancel_fee/{booking_id}")
async def estimate_cancel_fee(booking_id: str):
    if booking_id not in BOOKINGS:
        raise HTTPException(404, "Booking not found")
    
    booking = BOOKINGS[booking_id]
    
    created_at = datetime.datetime.fromisoformat(booking["created_at"])
    now = datetime.datetime.utcnow()
    time_elapsed_seconds = (now - created_at).total_seconds()
    
    if time_elapsed_seconds <= 30:
        return {"fee_applied": False, "cancellation_fee": 0}
    else:
        total_fee = _calculate_cancellation_fee(booking, time_elapsed_seconds)
        return {"fee_applied": True, "cancellation_fee": total_fee}

@app.post("/booking/cancel/{booking_id}")
async def cancel_booking(booking_id: str):
    if booking_id not in BOOKINGS:
        raise HTTPException(404, "Booking not found")

    booking = BOOKINGS[booking_id]
    
    created_at = datetime.datetime.fromisoformat(booking["created_at"])
    now = datetime.datetime.utcnow()
    time_elapsed_seconds = (now - created_at).total_seconds()

    taxi_id = booking["taxi"]
    if taxi_id in TAXIS:
        TAXIS[taxi_id]["available"] = True

    del BOOKINGS[booking_id]

    if time_elapsed_seconds <= 30:
        return {
            "status": "cancelled",
            "fee_applied": False,
            "message": f"Booking {booking_id} canceled within {int(time_elapsed_seconds)} seconds. No fee."
        }
    else:
        total_fee = _calculate_cancellation_fee(booking, time_elapsed_seconds)
        
        return {
            "status": "cancelled",
            "fee_applied": True,
            "message": f"Booking canceled after {int(time_elapsed_seconds)} seconds.",
            "cancellation_fee": total_fee
        }

# ---------------------------------------------
# GET taxis, RESET taxis, Ping (Unchanged)
# ---------------------------------------------
@app.get("/taxis")
def get_taxis():
    return _get_all_taxis_list()

@app.post("/taxis/reset")
def reset_taxis():
    for t in TAXIS.values():
        t["available"] = True
    return {"status": "OK"}

@app.get("/ping")
def ping():
    return {"status": "OK", "message": "Backend running"}