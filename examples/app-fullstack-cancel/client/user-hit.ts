// One search hit as the client sees it. Mirrors the server's SearchHit, kept independent so the
// client does not import server code.
export interface UserHit {
  id: number;
  name: string;
  email: string;
  city: string;
  cityCount: number;
}
