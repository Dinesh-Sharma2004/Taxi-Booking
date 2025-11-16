import React, { useState } from 'react';
import { useBooking } from '../context/BookingContext';

function BookingForm() {
  const [pickup, setPickup] = useState('');
  const [drop, setDrop] = useState('');
  
  const { 
    getQuote, isLoading, error, quoteDetails, confirmBooking, setQuoteDetails, 
    mapSelectMode, setMapSelectMode, 
    pickupAddress, dropAddress, 
    resetMapSelection, pickupCoords, dropCoords 
  } = useBooking();

  const finalPickup = pickupAddress || pickup;
  const finalDrop = dropAddress || drop;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!finalPickup || !finalDrop) {
      alert("❌ Please enter or select both pickup and drop locations.");
      return;
    }
    getQuote(finalPickup, finalDrop); 
  };
  
  const handleTextChange = (setter, coords) => (e) => {
      setter(e.target.value);
      if (coords) resetMapSelection(); 
      
      if (quoteDetails) setQuoteDetails(null); 
  };
  
  const getButtonText = (mode) => {
      if (mapSelectMode === mode) return `Click on map to select...`;
      if (mode === 'pickup' && pickupCoords) return `✅ Pick Up Selected`;
      if (mode === 'drop' && dropCoords) return `✅ Drop Selected`;
      return `Select ${mode} on Map`;
  };
  
  // --- RENDER QUOTE CONFIRMATION ---
  if (quoteDetails) {
      const q = quoteDetails;
      return (
          <div className="status-card">
              <h2>💰 Estimated Fare</h2>
              <p><strong>Pickup:</strong> {q.pickup}</p>
              <p><strong>Drop:</strong> {q.drop}</p>
              <p><strong>Distance:</strong> {q.distance_km} km ({q.eta_min} mins)</p>
              <p><strong>Taxi ETA:</strong> {q.taxi} ({q.taxi_eta_min} mins away)</p>
              <h3 style={{ color: '#007bff' }}>Total Fare: ₹{q.fare}</h3>
              
              <button 
                  onClick={() => confirmBooking(q)}
                  disabled={isLoading}
                  style={{ marginBottom: '10px' }}
              >
                  {isLoading ? 'Confirming...' : '✅ Confirm Booking'}
              </button>
              <button 
                  onClick={() => setQuoteDetails(null)} 
                  disabled={isLoading}
                  className="cancel-button"
              >
                  Cancel Quote
              </button>
          </div>
      );
  }
  // --- END RENDER ---

  return (
    <form className="booking-form" onSubmit={handleSubmit}>
      <h2>Book a New Ride</h2>

      <input
        type="text"
        placeholder="Pickup Location (e.g., Kurnool)"
        value={finalPickup}
        onChange={handleTextChange(setPickup, pickupCoords)}
        disabled={isLoading || !!pickupCoords}
      />
      <button 
        type="button" 
        onClick={() => setMapSelectMode('pickup')} 
        disabled={isLoading || (mapSelectMode !== null && mapSelectMode !== 'pickup')} 
        className={mapSelectMode === 'pickup' ? 'map-selection-active' : ''}
      >
        {getButtonText('pickup')}
      </button>

      <input
        type="text"
        placeholder="Drop Location (e.g., Delhi)"
        value={finalDrop}
        onChange={handleTextChange(setDrop, dropCoords)}
        disabled={isLoading || !!dropCoords}
      />
      <button 
        type="button" 
        onClick={() => setMapSelectMode('drop')} 
        disabled={isLoading || (mapSelectMode !== null && mapSelectMode !== 'drop')}
        className={mapSelectMode === 'drop' ? 'map-selection-active' : ''}
      >
        {getButtonText('drop')}
      </button>

      <button type="submit" disabled={isLoading || mapSelectMode !== null}>
        {isLoading ? 'Getting Estimate...' : 'Get Estimated Fare'}
      </button>
      
      {error && (
        <div className="message error">
          <strong>Error:</strong> {error}
        </div>
      )}
    </form>
  );
}

export default BookingForm;