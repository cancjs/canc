// mock Mongoose schema for hotel availability search

import { model, Schema } from 'mongoose';

export interface Room {
  _id: string;
  hotelId: string;
  number: string;
  capacity: number;
}

export interface Rate {
  _id: string;
  roomId: string;
  date: string;
  amount: number;
}

export interface Booking {
  _id: string;
  roomId: string;
  date: string;
}

const roomSchema = new Schema<Room>({
  _id: String,
  hotelId: String,
  number: String,
  capacity: Number,
});

const rateSchema = new Schema<Rate>({
  _id: String,
  roomId: String,
  date: String,
  amount: Number,
});

const bookingSchema = new Schema<Booking>({
  _id: String,
  roomId: String,
  date: String,
});

export const RoomModel = model<Room>('Room', roomSchema);
export const RateModel = model<Rate>('Rate', rateSchema);
export const BookingModel = model<Booking>('Booking', bookingSchema);
