// Shared types for the availability search result. Suffix-free: identical for both flavors.

export interface AvailabilityResult {
  hotelId: string;
  date: string;
  roomsFound: number;
  averageRate: number;
  occupancy: number;
}
