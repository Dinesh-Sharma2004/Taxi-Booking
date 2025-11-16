import React from 'react';
import { useBooking } from '../context/BookingContext';

function BookingStatus() {
  const {
    bookingDetails: b,
    cancelBooking,
    isLoading,
    error,
    taxiStatusMessage,
    currentCancelFee,
    freeCancelTime,
    rebook 
  } = useBooking();

  if (!b) return null;

  return (
    <div className="booking-status">
      <h2>🎉 Ride Confirmed!</h2>

      {/* Live Status Card */}
      <div className="status-card">
        <h3>Live Status</h3>
        <p className="message info">{taxiStatusMessage}</p>
        {freeCancelTime > 0 ? (
          <p className="message success">
            ✅ Free cancellation available for {freeCancelTime} seconds.
          </p>
        ) : (
          <p className="message warning">
            ⚠️ Est. Cancellation Fee: <strong>₹{currentCancelFee.toFixed(2)}</strong>
          </p>
        )}
      </div>

      {/* Booking Details Card */}
      <div className="status-card">
        <h3>Booking Details</h3>
        <p><strong>Booking ID:</strong> {b.id}</p>
        <p><strong>Taxi:</strong> {b.taxi}</p>
        <p><strong>Trip:</strong> {b.distance_km} km, {b.eta_min} mins</p>
        <p><strong>Weather:</strong> {b.weather}</p>
        <p><strong>Total Fare:</strong> <strong>₹{b.fare}</strong></p>
      </div>
      
      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={cancelBooking}
            disabled={isLoading}
            className="booking-form button cancel-button"
            style={{ flexGrow: 1 }}
          >
            {isLoading ? 'Cancelling...' : 'Cancel Booking'}
          </button>
           <button
            onClick={rebook} 
            disabled={isLoading}
            className="booking-form button"
            style={{ flexGrow: 1, backgroundColor: '#28a745' }}
          >
            Rebook
          </button>
      </div>

      {error && (
        <div className="message error">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}

export default BookingStatus;