import React, { useMemo } from 'react';
import {
    GoogleMap,
    useLoadScript,
    Marker,
    Polyline,
} from '@react-google-maps/api';
import { useBooking } from '../context/BookingContext';

// --- IMPORTANT ---
// Replace with your Google Maps API Key
const GOOGLE_API_KEY = "GOOGLE_API_KEY"; 

// --- UPDATED LIBRARIES: Added 'geocoding' and 'geometry' ---
const libraries = ['places', 'geocoding', 'geometry']; 
const mapContainerStyle = {
    width: '100%',
    height: '100%',
};
// Center of Delhi
const defaultCenter = {
    lat: 28.6139,
    lng: 77.209,
};

function MapComponent() {
    const { isLoaded, loadError } = useLoadScript({
        googleMapsApiKey: GOOGLE_API_KEY,
        libraries,
    });

    const { 
        taxis, bookingDetails, currentTaxiPosition, tripPhase,
        mapSelectMode, setMapSelectMode, 
        pickupCoords, setPickupCoords, setPickupAddress,
        dropCoords, setDropCoords, setDropAddress,
        pickupAddress, dropAddress, quoteDetails,
        decodedPath, // Taxi -> Pickup path (Polyline points)
        decodedTripPath, // Pickup -> Drop path (Polyline points)
    } = useBooking();
    
    // --- Utility: Reverse Geocoding ---
    const geocodeLatLng = async (latLng) => {
        if (!window.google) return "Location Not Found";

        const geocoder = new window.google.maps.Geocoder();
        try {
            const { results } = await geocoder.geocode({ location: latLng });
            if (results && results[0]) {
                return results[0].formatted_address; 
            }
            return `${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)}`;
        } catch (error) {
            console.error("Geocoding failed:", error);
            return `${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)}`;
        }
    };

    // --- Handle Map Clicks for Selection ---
    const handleMapClick = async (event) => {
        if (!mapSelectMode) return;

        const latLng = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        const address = await geocodeLatLng(latLng);

        if (mapSelectMode === 'pickup') {
            setPickupCoords(latLng);
            setPickupAddress(address);
        } else if (mapSelectMode === 'drop') {
            setDropCoords(latLng);
            setDropAddress(address);
        }
        setMapSelectMode(null); // Exit selection mode
    };

    // --- Memoized Icons (FIXED: Added isLoaded dependency) ---
    const taxiIcon = useMemo(() => {
        if (!isLoaded) return null; 
        return {
            path: "M20.5 4.6l-5.4-3.1c-.5-.3-1.2-.3-1.7 0L8 4.6c-.5.3-.8.8-.8 1.4v6.2l-2.7 1.6c-.3.2-.5.5-.5.9v4.2c0 .6.4 1.1 1 1.1h15c.6 0 1-.5 1-1.1V13.1c0-.4-.2-.7-.5-.9L17.2 12V6c0-.5-.3-1-.8-1.4z",
            fillColor: '#4CAF50', // Available Green
            fillOpacity: 0.9,
            strokeWeight: 1,
            strokeColor: '#fff',
            scale: 1.5,
            anchor: new window.google.maps.Point(12, 12)
        };
    }, [isLoaded]); 
    
    const taxiBusyIcon = useMemo(() => {
        if (!isLoaded) return null; 
        return {
            path: "M20.5 4.6l-5.4-3.1c-.5-.3-1.2-.3-1.7 0L8 4.6c-.5.3-.8.8-.8 1.4v6.2l-2.7 1.6c-.3.2-.5.5-.5.9v4.2c0 .6.4 1.1 1 1.1h15c.6 0 1-.5 1-1.1V13.1c0-.4-.2-.7-.5-.9L17.2 12V6c0-.5-.3-1-.8-1.4z",
            fillColor: '#F44336', // Busy Red
            fillOpacity: 0.9,
            strokeWeight: 1,
            strokeColor: '#fff',
            scale: 1.5,
            anchor: new window.google.maps.Point(12, 12)
        };
    }, [isLoaded]); 

    const assignedTaxiIcon = useMemo(() => {
        if (!isLoaded) return null; 
        return {
            path: "M20.5 4.6l-5.4-3.1c-.5-.3-1.2-.3-1.7 0L8 4.6c-.5.3-.8.8-.8 1.4v6.2l-2.7 1.6c-.3.2-.5.5-.5.9v4.2c0 .6.4 1.1 1 1.1h15c.6 0 1-.5 1-1.1V13.1c0-.4-.2-.7-.5-.9L17.2 12V6c0-.5-.3-1-.8-1.4z",
            fillColor: '#1A73E8', // Assigned Deep Blue
            fillOpacity: 1.0,
            strokeWeight: 1.5,
            strokeColor: '#fff',
            scale: 1.8, 
            anchor: new window.google.maps.Point(12, 12)
        };
    }, [isLoaded]); 
    
    // Custom SVG for Pickup/Drop Pin (Circle)
    const stopPin = (color, label) => ({
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#fff',
        scale: 8,
        label: {
            text: label,
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
        },
    });

    const pickupPin = useMemo(() => {
        if (!isLoaded) return null;
        return stopPin('#53389e', 'P'); // Indigo Purple
    }, [isLoaded]); 

    const dropPin = useMemo(() => {
        if (!isLoaded) return null;
        return stopPin('#F44336', 'D'); // Red
    }, [isLoaded]); 
    
    if (loadError) return "Error loading maps";
    
    if (!isLoaded || !taxiIcon) {
        return <div className="text-center p-4 text-gray-500">Loading Maps...</div>;
    }

    // Determine which taxi is the assigned one
    const assignedTaxiId = bookingDetails?.taxi || quoteDetails?.taxi; 

    // Use pickup location from confirmed booking, quote, or map selection for centering
    const centerLat = bookingDetails?.pickup_lat || quoteDetails?.pickup_lat || pickupCoords?.lat || defaultCenter.lat;
    const centerLng = bookingDetails?.pickup_lng || quoteDetails?.pickup_lng || pickupCoords?.lng || defaultCenter.lng;


    return (
        <GoogleMap
            mapContainerStyle={mapContainerStyle}
            zoom={12}
            center={{ lat: centerLat, lng: centerLng }}
            onClick={handleMapClick} 
            options={{
                disableDefaultUI: true, // Hides default map buttons
                zoomControl: true,
                styles: [ // Optional: Slightly dimmed map style for better contrast
                    {
                        featureType: "poi",
                        stylers: [{ visibility: "off" }]
                    },
                    {
                        featureType: "transit",
                        elementType: "labels.icon",
                        stylers: [{ visibility: "off" }]
                    }
                ]
            }}
        >
            {/* 1. Show all available/busy taxis in real-time */}
            {taxis.map((taxi) => {
                // Hide the taxi if it's the one currently assigned (in quote or booking)
                if (taxi.id === assignedTaxiId) return null; 
                
                return (
                    <Marker
                        key={taxi.id}
                        position={{ lat: taxi.lat, lng: taxi.lng }}
                        icon={taxi.available ? taxiIcon : taxiBusyIcon}
                        title={`${taxi.id} - ${taxi.available ? 'Available' : 'Busy'}`}
                    />
                );
            })}

            {/* 2. Show the confirmed route and markers OR the pre-booking map selection markers */}
            {bookingDetails ? (
                // --- BOOKING CONFIRMED ---
                <>
                    
                    {/* Pre-Pickup Route (Taxi -> Pickup) - Only shown while taxi is approaching */}
                    {(tripPhase === 'to_pickup' || tripPhase === 'at_pickup') && decodedPath.length > 0 && (
                        <Polyline
                            path={decodedPath}
                            options={{
                                strokeColor: '#1A73E8', // Approach Route: Deep Blue
                                strokeOpacity: 0.9,
                                strokeWeight: 4,
                                zIndex: 900
                            }}
                        />
                    )}

                    {/* Main Trip Route (Pickup -> Drop) - Only shown when user is onboard */}
                    {(tripPhase === 'to_drop' || tripPhase === 'finished') && decodedTripPath.length > 0 && (
                         <Polyline
                            path={decodedTripPath}
                            options={{
                                strokeColor: '#53389e', // Trip Route: Indigo
                                strokeOpacity: 0.8,
                                strokeWeight: 5,
                                zIndex: 900
                            }}
                        />
                    )}

                    {/* Booking Markers */}
                    <Marker position={{ lat: bookingDetails.pickup_lat, lng: bookingDetails.pickup_lng }} icon={pickupPin} title="Pickup" />
                    {bookingDetails.drop_lat && (
                        <Marker position={{ lat: bookingDetails.drop_lat, lng: bookingDetails.drop_lng }} icon={dropPin} title="Destination" />
                    )}
                </>
            ) : (
                // --- QUOTE PHASE: Show P -> D route ---
                <>
                    {/* Quote Phase: Show P->D route */}
                    {quoteDetails && decodedTripPath.length > 0 && (
                        <Polyline 
                            path={decodedTripPath}
                            options={{
                                strokeColor: '#53389e',
                                strokeOpacity: 0.7,
                                strokeWeight: 4,
                                zIndex: 900
                            }}
                        />
                    )}
                    
                    {/* Quote Markers */}
                    {quoteDetails && <Marker position={{ lat: quoteDetails.pickup_lat, lng: quoteDetails.pickup_lng }} icon={pickupPin} title={quoteDetails.pickup} />}
                    {quoteDetails && <Marker position={{ lat: quoteDetails.drop_lat, lng: quoteDetails.drop_lng }} icon={dropPin} title={quoteDetails.drop} />}
                    
                    {/* Map Selection Markers (remain the same) */}
                    {pickupCoords && <Marker position={pickupCoords} icon={pickupPin} title={`Pickup: ${pickupAddress}`} />}
                    {dropCoords && <Marker position={dropCoords} icon={dropPin} title={`Drop: ${dropAddress}`} />}
                </>
            )}


            {/* 3. Show the assigned taxi moving */}
            {assignedTaxiId && currentTaxiPosition && (
                <Marker
                    position={currentTaxiPosition}
                    icon={assignedTaxiIcon}
                    title={`Your Taxi: ${assignedTaxiId}`}
                    zIndex={1000} 
                />
            )}
        </GoogleMap>
    );
}

export default MapComponent;
