import React from 'react';
import './App.css';
import { BookingProvider, useBooking } from './context/BookingContext';
import BookingForm from './components/BookingForm';
import BookingStatus from './components/BookingStatus';
import MapComponent from './components/MapComponent'; // Corrected import name

// Main content component
function AppContent() {
  const { bookingDetails } = useBooking();

  return (
    <div className="app-container">
      <div className="panel">
        <h1>🚕 Taxi Booking</h1>
        {bookingDetails ? <BookingStatus /> : <BookingForm />}
      </div>
      <div className="map-container">
        <MapComponent />
      </div>
    </div>
  );
}

// Main App component
function App() {
  return (
    <BookingProvider>
      <AppContent />
    </BookingProvider>
  );
}

export default App;