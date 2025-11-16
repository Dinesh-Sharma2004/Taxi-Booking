import React, { useState, useEffect, useMemo } from 'react';
import {
  GoogleMap,
  useLoadScript,
  Marker,
  DirectionsRenderer,
} from '@react-google-maps/api';
import { useBooking } from '../context/BookingContext';

// --- IMPORTANT ---
// Replace with your Google Maps API Key
const GOOGLE_API_KEY = "AIzaSyBpWJtHj2x2ZA6ERaVRtkeV4_meNLvG1GU"; 

// --- UPDATED LIBRARIES: Added 'geocoding' for reverse lookup ---
const libraries = ['places', 'geocoding'];
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
    taxis, bookingDetails, currentTaxiPosition, 
    mapSelectMode, setMapSelectMode, 
    pickupCoords, setPickupCoords, setPickupAddress,
    dropCoords, setDropCoords, setDropAddress,
    pickupAddress, dropAddress, quoteDetails 
  } = useBooking();
  const [directions, setDirections] = useState(null);

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
  
  // --- Memoized Icons ---
  const taxiIcon = useMemo(() => {
    if (!isLoaded) return null; 
    return {
      url: 'https://maps.google.com/mapfiles/kml/paddle/grn-blank.png',
      scaledSize: new window.google.maps.Size(32, 32),
    };
  }, [isLoaded]); 
  
  const taxiBusyIcon = useMemo(() => {
    if (!isLoaded) return null; 
    return {
      url: 'https://maps.google.com/mapfiles/kml/paddle/red-blank.png',
      scaledSize: new window.google.maps.Size(32, 32),
    };
  }, [isLoaded]); 

  const assignedTaxiIcon = useMemo(() => {
    if (!isLoaded) return null; 
    return {
        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, 
        fillColor: '#007bff', 
        fillOpacity: 1.0,
        strokeWeight: 1,
        strokeColor: '#000000',
        scale: 6, 
    };
  }, [isLoaded]); 
  
  // Effect to fetch directions when a booking is confirmed
  useEffect(() => {
    if (!bookingDetails || !isLoaded) { 
      setDirections(null);
      return;
    }
    
    if (!bookingDetails.drop_lat) {
      console.warn("Booking details missing drop_lat/drop_lng. Cannot draw route.");
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: bookingDetails.pickup_lat, lng: bookingDetails.pickup_lng },
        destination: { lat: bookingDetails.drop_lat, lng: bookingDetails.drop_lng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
        } else {
          console.error(`Directions request failed due to ${status}`);
        }
      }
    );
  }, [bookingDetails, isLoaded]);

  if (loadError) return "Error loading maps";
  
  if (!isLoaded || !taxiIcon) {
    return "Loading Maps...";
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
        <>
          {/* Confirmed Booking Route and Markers */}
          {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />}
          <Marker position={{ lat: bookingDetails.pickup_lat, lng: bookingDetails.pickup_lng }} label="P" />
          {bookingDetails.drop_lat && (
            <Marker position={{ lat: bookingDetails.drop_lat, lng: bookingDetails.drop_lng }} label="D" />
          )}
        </>
      ) : (
        <>
          {/* Quote/Pre-booking Markers */}
          {quoteDetails && <Marker position={{ lat: quoteDetails.pickup_lat, lng: quoteDetails.pickup_lng }} label="P" title={quoteDetails.pickup} />}
          {quoteDetails && <Marker position={{ lat: quoteDetails.drop_lat, lng: quoteDetails.drop_lng }} label="D" title={quoteDetails.drop} />}
          
          {/* Map Selection Markers */}
          {pickupCoords && <Marker position={pickupCoords} label="P" title={`Pickup: ${pickupAddress}`} />}
          {dropCoords && <Marker position={dropCoords} label="D" title={`Drop: ${dropAddress}`} />}
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