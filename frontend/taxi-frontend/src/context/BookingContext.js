import React, { createContext, useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';

const API_BASE = "http://localhost:9000";
const BookingContext = createContext();

// Helper: Used for linear interpolation, mainly for calculating movement vectors.
const linearInterpolate = (start, end, progress) => {
  return start + (end - start) * progress;
};

// Simulated constants
const LOADING_TIME_SEC = 15; 
const SIMULATION_INTERVAL_SEC = 2; // Our simulation tick rate (2 seconds)

export const BookingProvider = ({ children }) => {
  const [bookingDetails, setBookingDetails] = useState(null);
  const [quoteDetails, setQuoteDetails] = useState(null);
  const [taxis, setTaxis] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Live-updating data
  const [currentTaxiPosition, setCurrentTaxiPosition] = useState(null);
  const [currentCancelFee, setCurrentCancelFee] = useState(0);
  const [taxiStatusMessage, setTaxiStatusMessage] = useState("");
  const [freeCancelTime, setFreeCancelTime] = useState(30);

  // --- TRIP PHASE STATE ---
  const [tripPhase, setTripPhase] = useState(null); 
  const tripStartTimeRef = useRef(null);
  
  // Refs to track position and remaining distance for dynamic simulation
  const taxiLocationRef = useRef(null); 
  const remainingDistanceRef = useRef(null); 

  // Map States
  const [mapSelectMode, setMapSelectMode] = useState(null); 
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropCoords, setDropCoords] = useState(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropAddress, setDropAddress] = useState('');

  const simulationInterval = useRef(null);

  const fetchTaxis = async () => {
    try {
      const response = await axios.get(`${API_BASE}/taxis`);
      setTaxis(response.data);
    } catch (err) {
      console.error("Failed to fetch taxis:", err);
    }
  };

  useEffect(() => {
    fetchTaxis();
    const taxisInterval = setInterval(fetchTaxis, 10000); 
    return () => clearInterval(taxisInterval);
  }, []);

  // --- GEODESIC DISTANCE HELPER (Haversine Formula Approximation) ---
  const calculateDistanceKm = (p1, p2) => {
      const R = 6371; // Earth's radius in km
      const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
      const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
      const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) *           Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; 
  };

  // Main simulation loop
  useEffect(() => {
    // 1. CLEAR AND EXIT CHECK
    if (!bookingDetails) {
      clearInterval(simulationInterval.current);
      simulationInterval.current = null;
      setCurrentTaxiPosition(null);
      setTripPhase(null);
      tripStartTimeRef.current = null;
      taxiLocationRef.current = null;
      remainingDistanceRef.current = null;
      return;
    }

    const b = bookingDetails;
    const createdAt = new Date(b.created_at);
    
    // 2. INITIALIZATION
    if (!tripPhase) {
        setTripPhase('to_pickup');
        
        const initialPos = { lat: b.taxi_start_lat, lng: b.taxi_start_lng };
        setCurrentTaxiPosition(initialPos);
        
        // Initialize refs with starting data
        taxiLocationRef.current = initialPos;
        remainingDistanceRef.current = b.taxi_distance_km; // Use estimated distance from quote
        tripStartTimeRef.current = createdAt; 
    }

    // 3. SET INTERVAL FOR MOVEMENT/STATUS UPDATE
    simulationInterval.current = setInterval(async () => {
      const now = new Date();
      const initialTimeElapsedSec = (now.getTime() - createdAt.getTime()) / 1000;
      
      // --- PHASE 1: TAXI TO PICKUP (Dynamic Speed) ---
      if (tripPhase === 'to_pickup') {
          
          let currentPos = taxiLocationRef.current;
          const pickupPos = { lat: b.pickup_lat, lng: b.pickup_lng };
          
          // FIX: Safety check to prevent reading 'lat' of null
          if (!currentPos) {
              return; 
          }

          // 1. FLUCTUATING SPEED (0 to 30 km/h)
          const speed_kph = Math.random() * 30; // Random speed
          const speed_mps = speed_kph * 1000 / 3600;
          const distance_moved_m = speed_mps * SIMULATION_INTERVAL_SEC;
          const distance_moved_km = distance_moved_m / 1000;
          
          // Get distance to target (used for direction vector)
          const distanceToPickup = calculateDistanceKm(currentPos, pickupPos);
          
          if (distanceToPickup <= distance_moved_km || remainingDistanceRef.current <= 0) {
              // TRANSITION 1: ARRIVAL
              setTripPhase('at_pickup'); 
              setTaxiStatusMessage(`🚖 Taxi (${b.taxi}) has arrived! Please board.`);
              setCurrentTaxiPosition(pickupPos);
              taxiLocationRef.current = pickupPos;
              tripStartTimeRef.current = now; // Mark time of arrival for loading delay
          } else {
              // Calculate movement vector (simple interpolation of distance)
              const fraction = distance_moved_km / distanceToPickup;

              const newLat = linearInterpolate(currentPos.lat, pickupPos.lat, fraction);
              const newLng = linearInterpolate(currentPos.lng, pickupPos.lng, fraction);
              
              currentPos = { lat: newLat, lng: newLng };
              setCurrentTaxiPosition(currentPos);
              taxiLocationRef.current = currentPos;
              
              // 2. RECALCULATE REMAINING ETA
              const remainingDist = distanceToPickup - distance_moved_km;
              remainingDistanceRef.current = Math.max(0, remainingDist);
              
              // Assuming current speed will be maintained for next estimate (Max(1s))
              const remainingTimeSec = remainingDist / (speed_kph / 3600);
              const remainingTimeMin = Math.ceil(remainingTimeSec / 60);

              setTaxiStatusMessage(`🚕 Taxi (${b.taxi}) is on the way! (${remainingTimeMin} mins, ${Math.round(speed_kph)} kph)`);
          }
      } 
      
      // --- PHASE 2: AT PICKUP (LOADING) ---
      else if (tripPhase === 'at_pickup') {
          const arrivalTime = tripStartTimeRef.current;
          const waitTimeSec = (now.getTime() - arrivalTime.getTime()) / 1000;

          if (waitTimeSec >= LOADING_TIME_SEC) {
              // TRANSITION 2: DEPARTURE
              setTripPhase('to_drop'); 
              tripStartTimeRef.current = now; // Reset time ref for trip duration
          } else {
              const secondsLeft = Math.ceil(LOADING_TIME_SEC - waitTimeSec);
              setTaxiStatusMessage(`🚶 User boarding (${secondsLeft} seconds until departure)`);
          }
      }

      // --- PHASE 3: TO DROP-OFF (Simplified for now, using fixed quote ETA) ---
      else if (tripPhase === 'to_drop') {
          const tripStartTime = tripStartTimeRef.current;
          const tripElapsedSec = (now.getTime() - tripStartTime.getTime()) / 1000;
          
          const tripEtaSec = b.eta_min * 60.0;
          const tripProgress = Math.min(1.0, tripElapsedSec / tripEtaSec);
          
          const currentLat = linearInterpolate(b.pickup_lat, b.drop_lat, tripProgress);
          const currentLng = linearInterpolate(b.pickup_lng, b.drop_lng, tripProgress);
          setCurrentTaxiPosition({ lat: currentLat, lng: currentLng });
          
          if (tripProgress >= 1.0) {
              // TRANSITION 3: FINISHED
              setTripPhase('finished'); 
              setTaxiStatusMessage(`🏁 Trip complete! Thank you for riding with us.`);
              clearInterval(simulationInterval.current);
          } else {
              const remainingTimeMin = b.eta_min * (1.0 - tripProgress);
              setTaxiStatusMessage(`🟢 En route to ${b.drop.substring(0, 15)}... ETA: ${Math.ceil(remainingTimeMin)} mins.`);
          }
      }

      // --- CANCEL FEE LOGIC ---
      if (tripPhase !== 'to_drop' && tripPhase !== 'finished') {
          if (initialTimeElapsedSec <= 30) {
              setFreeCancelTime(Math.round(30 - initialTimeElapsedSec));
              setCurrentCancelFee(0);
          } else {
              setFreeCancelTime(0);
              try {
                const feeRes = await axios.get(`${API_BASE}/booking/estimate_cancel_fee/${b.id}`);
                if (feeRes.data.fee_applied) {
                    setCurrentCancelFee(feeRes.data.cancellation_fee);
                }
              } catch (err) {
                  console.error("Could not fetch cancel fee", err);
              }
          }
      }

    }, SIMULATION_INTERVAL_SEC * 1000); 

    return () => clearInterval(simulationInterval.current);
  }, [bookingDetails, tripPhase]);
  
  // --- Map and State Reset Functions ---
  const resetMapSelection = () => {
      setMapSelectMode(null);
      setPickupCoords(null);
      setDropCoords(null);
      setPickupAddress('');
      setDropAddress('');
  };

  // --- QUOTE/CONFIRM/CANCEL/REBOOK FUNCTIONS ---
  
  const getQuote = async (pickup, drop) => {
    setIsLoading(true);
    setError(null);
    setQuoteDetails(null); 
    try {
      const response = await axios.post(
        `${API_BASE}/booking/estimate`,
        null,
        { params: { pickup, drop } }
      );
      setQuoteDetails(response.data);
      resetMapSelection(); 
      fetchTaxis(); 
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Failed to get quote.";
      setError(errorMsg);
      console.error(err);
    }
    setIsLoading(false);
  };
  
  const confirmBooking = async (quote) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE}/booking/confirm`, quote);
      setBookingDetails(response.data); 
      setQuoteDetails(null); 
      setTripPhase('to_pickup'); // Set initial phase upon confirmation
      fetchTaxis(); 
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Failed to confirm booking. Try getting a new quote.";
      setError(errorMsg);
      console.error(err);
    }
    setIsLoading(false);
  };

  const cancelBooking = async () => {
    if (!bookingDetails) return;
    
    // Only allow cancellation if trip hasn't started
    if (tripPhase === 'to_drop' || tripPhase === 'finished') {
        alert("Cannot cancel: Trip is already in progress!");
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE}/booking/cancel/${bookingDetails.id}`);
      alert(response.data.message + (response.data.fee_applied ? ` Fee: ₹${response.data.cancellation_fee}` : ''));
      setBookingDetails(null); 
      fetchTaxis(); 
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Failed to cancel booking.";
      setError(errorMsg);
      console.error(err);
    }
    setIsLoading(false);
  };

  const rebook = () => {
      if (!bookingDetails) {
          setBookingDetails(null);
          setQuoteDetails(null);
          setTripPhase(null);
          fetchTaxis();
          return;
      }
      
      const { pickup, drop } = bookingDetails;
      
      setBookingDetails(null);
      setQuoteDetails(null);
      setTripPhase(null);
      
      alert(`🔄 Rebooking trip from ${pickup} to ${drop}! Finding nearest available taxi...`);

      getQuote(pickup, drop);
      
      fetchTaxis();
  };

  return (
    <BookingContext.Provider
      value={{
        bookingDetails,
        quoteDetails, 
        taxis,
        isLoading,
        error,
        getQuote, 
        confirmBooking,
        cancelBooking,
        rebook, 
        currentTaxiPosition,
        currentCancelFee,
        taxiStatusMessage,
        freeCancelTime,
        tripPhase, 
        setQuoteDetails,
        mapSelectMode, setMapSelectMode, 
        pickupCoords, setPickupCoords, 
        pickupAddress, setPickupAddress, 
        dropCoords, setDropCoords, 
        dropAddress, setDropAddress,
        resetMapSelection
      }}
    >
      {children}
    </BookingContext.Provider>
  );
};

export const useBooking = () => {
  return useContext(BookingContext);
};