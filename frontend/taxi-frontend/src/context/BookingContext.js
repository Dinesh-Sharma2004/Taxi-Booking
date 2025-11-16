import React, { createContext, useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';

const API_BASE = "http://localhost:9000";
const BookingContext = createContext();

// Helper to decode polyline (Relies on Google Maps API being loaded in the global scope)
const decodePolyline = (polyline) => {
    if (!window.google || !window.google.maps || !window.google.maps.geometry || !window.google.maps.geometry.encoding) {
        console.warn("Google Maps geometry library not available for polyline decoding.");
        return [];
    }
    try {
        const path = window.google.maps.geometry.encoding.decodePath(polyline);
        return path.map(p => ({ lat: p.lat(), lng: p.lng() }));
    } catch (e) {
        console.error("Polyline decoding failed:", e);
        return [];
    }
};

// --- GEODESIC DISTANCE HELPER (Defined outside the component to fix ESLint) ---
const calculateDistanceKm = (p1, p2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
    const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
};
// -----------------------------------------------------------------------------

export const BookingProvider = ({ children }) => {
    const [bookingDetails, setBookingDetails] = useState(null);
    const [quoteDetails, setQuoteDetails] = useState(null);
    const [rebookQuoteDetails, setRebookQuoteDetails] = useState(null); 
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
    
    // Refs and states for route tracking
    const [decodedPath, setDecodedPath] = useState([]); // Taxi -> Pickup path
    const [decodedTripPath, setDecodedTripPath] = useState([]); // Pickup -> Drop path
    
    // State variables for map interactions
    const [mapSelectMode, setMapSelectMode] = useState(null); 
    const [pickupCoords, setPickupCoords] = useState(null);
    const [dropCoords, setDropCoords] = useState(null);
    const [pickupAddress, setPickupAddress] = useState('');
    const [dropAddress, setDropAddress] = useState('');

    const simulationInterval = useRef(null);

    // --- Taxi Fleet Polling ---
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

    // --- Polyline Decoding Effect ---
    useEffect(() => {
        const taxiPolyline = bookingDetails?.taxi_route_polyline || quoteDetails?.taxi_route_polyline || rebookQuoteDetails?.taxi_route_polyline || null;
        if (taxiPolyline) {
            setDecodedPath(decodePolyline(taxiPolyline));
        } else {
            setDecodedPath([]);
        }
        
        const tripPolyline = bookingDetails?.trip_route_polyline || quoteDetails?.trip_route_polyline || rebookQuoteDetails?.trip_route_polyline || null;
        if (tripPolyline) {
            setDecodedTripPath(decodePolyline(tripPolyline));
        } else {
            setDecodedTripPath([]);
        }
    }, [bookingDetails, quoteDetails, rebookQuoteDetails]);
    
    // --- Phase 0: Initial Cleanup and Fee Polling ---
    useEffect(() => {
         if (!bookingDetails) {
            clearInterval(simulationInterval.current);
            simulationInterval.current = null;
            setCurrentTaxiPosition(null);
            setTripPhase(null);
            return;
        }

        // Poll for cancel fee status every 2 seconds
        simulationInterval.current = setInterval(async () => {
            const now = new Date();
            const created = new Date(bookingDetails.created_at);
            const initialTimeElapsedSec = (now.getTime() - created.getTime()) / 1000;

            // Fee and Rebook/Cancel availability logic runs only during these phases
            if (tripPhase === 'to_pickup' || tripPhase === 'at_pickup') {
                if (initialTimeElapsedSec <= 30) {
                    setFreeCancelTime(Math.round(30 - initialTimeElapsedSec));
                    setCurrentCancelFee(0);
                } else {
                    setFreeCancelTime(0);
                    try {
                        const feeRes = await axios.get(`${API_BASE}/booking/estimate_cancel_fee/${bookingDetails.id}`);
                        if (feeRes.data.fee_applied) {
                            setCurrentCancelFee(feeRes.data.cancellation_fee);
                        }
                    } catch (err) {
                        console.error("Could not fetch cancel fee", err);
                    }
                }
            }
        }, 2000);

        return () => clearInterval(simulationInterval.current);

    }, [bookingDetails, tripPhase]);


    // Effect 1: TAXI APPROACH (to_pickup)
    useEffect(() => {
        if (!bookingDetails || decodedPath.length < 2 || tripPhase !== 'to_pickup') return;

        // Calculate the smooth animation speed based on ETA
        const totalDurationMs = bookingDetails.taxi_eta_min * 60 * 1000;
        const pathLength = decodedPath.length;
        const intervalDuration = totalDurationMs / pathLength; 
        
        let index = 0;
        
        // Start position is the first point in the path (which should be taxi_start_lat/lng)
        setCurrentTaxiPosition(decodedPath[0]);

        const interval = setInterval(() => {
            if (index < pathLength - 1) {
                index++;
                setCurrentTaxiPosition(decodedPath[index]);
                
                // Update ETA status
                const progress = index / pathLength;
                const distanceRemainingKm = bookingDetails.taxi_distance_km * (1 - progress);
                const remainingTimeMin = bookingDetails.taxi_eta_min * (1 - progress);

                setTaxiStatusMessage(`🚕 Taxi (${bookingDetails.taxi}) is on the way! (${Math.max(1, Math.ceil(remainingTimeMin))} mins, ${distanceRemainingKm.toFixed(1)} km)`);
                
            } else {
                // ARRIVED
                setTripPhase('at_pickup');
                clearInterval(interval);
            }
        }, intervalDuration); 

        return () => clearInterval(interval);
    }, [tripPhase, bookingDetails, decodedPath]);


    // Effect 2: USER LOADING (at_pickup)
    useEffect(() => {
        if (tripPhase !== 'at_pickup') return;
        
        const LOADING_TIME_SEC = 15;
        let secondsLeft = LOADING_TIME_SEC;
        
        const statusInterval = setInterval(() => {
            if (secondsLeft <= 0) {
                setTripPhase('to_drop');
                clearInterval(statusInterval);
            } else {
                 setTaxiStatusMessage(`🚶 User boarding (${secondsLeft} seconds until departure)`);
                 secondsLeft--;
            }
        }, 1000); 

        return () => clearInterval(statusInterval);
    }, [tripPhase]);


    // Effect 3: TRIP TO DROP-OFF (to_drop)
    useEffect(() => {
        if (!bookingDetails || decodedTripPath.length < 2 || tripPhase !== 'to_drop') return;

        const totalDurationMs = bookingDetails.eta_min * 60 * 1000;
        const pathLength = decodedTripPath.length;
        const intervalDuration = totalDurationMs / pathLength; 
        
        let index = 0;
        
        // Set initial position to pickup location (start of trip polyline)
        setCurrentTaxiPosition(decodedTripPath[0]);

        const interval = setInterval(() => {
            if (index < pathLength - 1) {
                index++;
                setCurrentTaxiPosition(decodedTripPath[index]);

                const tripProgress = index / pathLength;
                const remainingTimeMin = bookingDetails.eta_min * (1.0 - tripProgress);
                
                setTaxiStatusMessage(`🟢 En route to ${bookingDetails.drop.substring(0, 20)}... ETA: ${Math.ceil(remainingTimeMin)} mins.`);
            } else {
                // ARRIVED AT DESTINATION
                setTripPhase('finished');
                setTaxiStatusMessage(`🏁 Trip complete! Total Fare: ₹${bookingDetails.fare}`);
                clearInterval(interval);
            }
        }, intervalDuration); 

        return () => clearInterval(interval);
    }, [tripPhase, bookingDetails, decodedTripPath]);


    // --- QUOTE/CONFIRM/CANCEL/REBOOK UTILITIES ---
    
    // Fixes ESLint error by defining the required setter functions
    const resetMapSelection = () => {
        setMapSelectMode(null);
        setPickupCoords(null);
        setDropCoords(null);
        setPickupAddress('');
        setDropAddress('');
        setDecodedPath([]); 
        setDecodedTripPath([]); 
    };


    const _cancelOldBooking = async (bookingId) => {
        try {
            await axios.post(`${API_BASE}/booking/cancel/${bookingId}`);
            fetchTaxis(); 
            return true;
        } catch (err) {
            console.error("Failed to silently cancel old booking:", err);
            return false;
        }
    };

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
            setTripPhase('to_pickup'); // START SIMULATION
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
        
        // CANCELLATION IS ONLY ALLOWED BEFORE DRIVER ARRIVES
        if (tripPhase !== 'to_pickup') {
            console.log("Cannot cancel: Driver has already arrived or trip is in progress!");
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const response = await axios.post(`${API_BASE}/booking/cancel/${bookingDetails.id}`);
            console.log(response.data.message + (response.data.fee_applied ? ` Fee: ₹${response.data.cancellation_fee}` : ''));
            setBookingDetails(null); 
            setQuoteDetails(null); 
            fetchTaxis(); 
        } catch (err) {
            const errorMsg = err.response?.data?.detail || "Failed to cancel booking.";
            setError(errorMsg);
            console.error(err);
        }
        setIsLoading(false);
    };

    // --- REBOOK FLOW FUNCTIONS ---

    const initiateRebook = async () => {
        if (!bookingDetails) return;
        
        // REBOOKING IS ONLY ALLOWED BEFORE DRIVER ARRIVES
        if (tripPhase !== 'to_pickup') {
             console.log("Cannot rebook: Driver has already arrived or trip is in progress!");
             return;
        }
        
        const oldBookingId = bookingDetails.id;
        const { pickup, drop } = bookingDetails;
        
        setQuoteDetails(null);
        setRebookQuoteDetails(null);
        setIsLoading(true);
        setError(null);
        
        try {
            // 1. Fetch the new estimate
            const quoteResponse = await axios.post(
                `${API_BASE}/booking/estimate`,
                null,
                { params: { pickup, drop } }
            );
            const newQuote = quoteResponse.data;

            // 2. Fetch the cancellation fee for the old booking
            let cancelFee = 0;
            try {
                const feeResponse = await axios.get(`${API_BASE}/booking/estimate_cancel_fee/${oldBookingId}`);
                cancelFee = feeResponse.data.cancellation_fee;
            } catch (feeErr) {
                console.error("Failed to fetch cancel fee for rebooking:", feeErr);
            }

            const totalRebookCost = newQuote.fare + cancelFee;

            // Store quote data + calculated fees
            setRebookQuoteDetails({
                ...newQuote,
                cancellationFee: cancelFee,
                totalRebookCost: totalRebookCost,
            });

        } catch (err) {
            const errorMsg = err.response?.data?.detail || "Failed to get rebooking quote. Try again.";
            setError(errorMsg);
            console.error(err);
        }
        setIsLoading(false);
    };

    const confirmRebook = async (quote) => {
        if (!bookingDetails) return;
        
        const oldBookingId = bookingDetails.id;

        setIsLoading(true);
        setError(null);

        try {
            const response = await axios.post(`${API_BASE}/booking/confirm`, quote);
            const newBooking = response.data;
            
            await _cancelOldBooking(oldBookingId);

            setBookingDetails(newBooking); 
            setRebookQuoteDetails(null); 
            setTripPhase('to_pickup'); 
            fetchTaxis(); 

        } catch (err) {
            const errorMsg = err.response?.data?.detail || "Failed to confirm rebooking. The old booking remains active.";
            setError(errorMsg);
            console.error(err);
            setRebookQuoteDetails(null); 
        }
        setIsLoading(false);
    };

    const cancelRequote = () => {
        setRebookQuoteDetails(null);
    };

    const rebook = initiateRebook;


    // --- CONTEXT PROVIDER RENDER ---
    return (
        <BookingContext.Provider
            value={{
                bookingDetails,
                quoteDetails, 
                rebookQuoteDetails,
                taxis,
                isLoading,
                error,
                getQuote, 
                confirmBooking,
                cancelBooking,
                rebook,
                confirmRebook,
                cancelRequote,
                currentTaxiPosition,
                currentCancelFee,
                taxiStatusMessage,
                freeCancelTime,
                tripPhase, 
                setQuoteDetails,
                // Exposing map setters
                mapSelectMode, setMapSelectMode, 
                pickupCoords, setPickupCoords, 
                pickupAddress, setPickupAddress, 
                dropCoords, setDropCoords, 
                dropAddress, setDropAddress,
                resetMapSelection,
                decodedPath,
                decodedTripPath,
            }}
        >
            {children}
        </BookingContext.Provider>
    );
};

export const useBooking = () => {
    return useContext(BookingContext);
};
