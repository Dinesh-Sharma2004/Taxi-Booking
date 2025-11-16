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
        rebook, 
        rebookQuoteDetails: rq, 
        confirmRebook, 
        cancelRequote, 
        tripPhase
    } = useBooking();

    if (!b) return null;

    // --- RENDER REBOOK CONFIRMATION UI ---
    if (rq) {
        return (
            <div className="p-5 bg-white border border-yellow-400 rounded-2xl shadow-xl font-sans">
                <h2 className="text-xl font-bold text-gray-800 mb-4">🔄 Confirm Rebook?</h2>
                <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2 text-gray-700">New Trip Details</h3>
                    <p className="text-sm"><strong>Pickup:</strong> {rq.pickup}</p>
                    <p className="text-sm"><strong>Drop:</strong> {rq.drop}</p>
                    <p className="text-sm"><strong>New Taxi:</strong> {rq.taxi} ({rq.taxi_eta_min} mins away)</p>
                    
                    <hr className="my-3 border-gray-300 border-dashed" />
                    
                    <p className="text-md"><strong>New Estimated Fare:</strong> <span className="font-semibold text-gray-700">₹{rq.fare.toFixed(2)}</span></p>
                    <p className="text-sm text-red-600">
                        <strong>+ Cancellation Fee (Old Trip):</strong> <span className="font-semibold">₹{rq.cancellationFee.toFixed(2)}</span>
                    </p>
                    
                    <hr className="my-2 border-gray-400" />
                    <p className="text-2xl font-extrabold text-green-700">
                        Total Cost: ₹{rq.totalRebookCost.toFixed(2)}
                    </p>
                </div>
                
                <p className="text-xs text-gray-600 mt-3 text-center">
                    Your current booking will be cancelled and replaced.
                </p>

                <div className="flex gap-3 mt-4">
                    <button
                        onClick={cancelRequote}
                        disabled={isLoading}
                        className="w-full py-3 bg-gray-300 text-gray-800 font-semibold rounded-xl hover:bg-gray-400 transition shadow-md"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => confirmRebook(rq)}
                        disabled={isLoading}
                        className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-md"
                    >
                        {isLoading ? 'Confirming...' : '✅ Confirm Rebook'}
                    </button>
                </div>
                {error && <div className="p-2 bg-red-100 text-red-700 rounded mt-3 text-sm"><strong>Error:</strong> {error}</div>}
            </div>
        );
    }
    // --- END RENDER REBOOK CONFIRMATION UI ---

    // Buttons are ENABLED only during the taxi approach phase
    const buttonsEnabled = tripPhase === 'to_pickup';

    // --- RENDER DEFAULT STATUS UI ---
    return (
        <div className="p-5 bg-white rounded-2xl shadow-2xl border border-gray-100 font-sans">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-4 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Ride Status
            </h2>

            {/* Live Status Card */}
            <div className="p-4 bg-indigo-50 border-l-4 border-indigo-600 rounded-lg mb-4 shadow-sm">
                <h3 className="text-lg font-bold text-indigo-700 mb-1">Live Status</h3>
                <p className="text-indigo-600 font-semibold">{taxiStatusMessage}</p>
                {freeCancelTime > 0 ? (
                    <p className="mt-2 text-green-600 text-sm font-medium">
                        ✅ Free cancellation available for **{freeCancelTime} seconds**.
                    </p>
                ) : (
                    <p className="mt-2 text-yellow-700 text-sm font-medium">
                        ⚠️ Est. Cancellation Fee: **₹{currentCancelFee.toFixed(2)}**
                    </p>
                )}
            </div>

            {/* Booking Details Card */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mb-6 shadow-inner">
                <h3 className="text-lg font-bold text-gray-800 mb-2">Booking Details</h3>
                <p className="text-sm text-gray-600"><strong>Booking ID:</strong> {b.id.substring(0, 8)}...</p>
                <p className="text-sm text-gray-600"><strong>Taxi:</strong> {b.taxi}</p>
                <p className="text-sm text-gray-600"><strong>Trip:</strong> {b.distance_km} km, {b.eta_min} mins</p>
                <p className="text-sm text-gray-600"><strong>Weather:</strong> {b.weather}</p>
                <p className="text-2xl font-extrabold text-green-700 mt-2">Total Fare: ₹{b.fare}</p>
            </div>
            
            {/* Action Buttons */}
            {buttonsEnabled && (
                <div className="flex gap-3">
                    <button
                        onClick={cancelBooking}
                        disabled={isLoading}
                        className="w-full py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition shadow-lg"
                    >
                        {isLoading ? 'Cancelling...' : 'Cancel Booking'}
                    </button>
                    <button
                        onClick={rebook} // Initiate Rebook (fetches quote and switches UI)
                        disabled={isLoading}
                        className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-lg"
                    >
                        {isLoading ? 'Checking for availability...' : 'Rebook'}
                    </button>
                </div>
            )}
             {!buttonsEnabled && (
                <div className="p-3 text-center bg-gray-100 text-gray-600 rounded-lg text-sm font-medium border border-gray-300">
                    {tripPhase === 'at_pickup' ? 'Driver has arrived. Please onboard.' :
                     tripPhase === 'to_drop' ? 'Trip in progress. Actions disabled.' :
                     'Booking actions unavailable.'}
                </div>
            )}

            {error && (
                <div className="p-2 bg-red-100 text-red-700 rounded mt-3 text-sm border border-red-300">
                    <strong>Error:</strong> {error}
                </div>
            )}
        </div>
    );
}

export default BookingStatus;
