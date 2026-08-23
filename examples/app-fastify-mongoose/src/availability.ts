// shared types for availability search result

export interface AvailabilityResult {
  hotelId: string;
  date: string;
  roomsFound: number;
  averageRate: number;
  occupancy: number;
}
